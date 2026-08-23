import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { parseMarkdown, serializeMarkdown } from "./markdown.ts";
import { CatalogIndex } from "./catalog.ts";
import { conflict, dataInvalid, invalidArgument, notFound } from "./errors.ts";
import { validateFrontmatter } from "./schema.ts";
import type { KnowledgeRepo } from "./repo.ts";
import type { RecipeMeta } from "./types.ts";

export interface PublishResult {
  recipeId: string;
  version: number;
  publishedPath: string;
  allergenFixes: string[];
}

function today(): string {
  return new Date().toISOString().slice(0, 10);
}

/** 校验 frontmatter 与目录引用，返回目录复核出的过敏原补充。 */
function reviewAgainstCatalog(
  meta: RecipeMeta,
  catalog: CatalogIndex,
  opts: { requireCatalogEntries: boolean },
): { allergenFixes: string[]; unknownIngredients: string[] } {
  const unknownIngredients: string[] = [];
  for (const ing of meta.ingredients) {
    const cat = catalog.byIdentifier(ing.id) ?? catalog.resolveLoose(ing.name);
    if (!cat) {
      unknownIngredients.push(`${ing.name}(${ing.id})`);
      continue;
    }
    if (cat.id !== ing.id) {
      throw dataInvalid(
        `食材 ${ing.name} 的 frontmatter id "${ing.id}" 与目录 id "${cat.id}" 不一致`,
        { subject: meta.recipe_id },
      );
    }
  }
  if (opts.requireCatalogEntries && unknownIngredients.length) {
    throw dataInvalid(
      `食材不在目录中，请先补目录: ${unknownIngredients.join("; ")}`,
      { subject: meta.recipe_id },
    );
  }
  const derived = catalog.allergenUnion(meta.ingredients.map((i) => i.id));
  const declared = new Set(meta.allergens);
  const allergenFixes = [...derived].filter((a) => !declared.has(a));
  return { allergenFixes, unknownIngredients };
}

/** 发布草稿：校验 → 过敏原复核 → 写入不可变发布文档（PRD §11）。 */
export function publishDraft(
  repo: KnowledgeRepo,
  catalog: CatalogIndex,
  recipeId: string,
  version: number,
): PublishResult {
  const draftPath = join(repo.draftsRoot, `${recipeId}-v${version}.md`);
  if (!existsSync(draftPath)) {
    throw notFound(`草稿不存在: ${draftPath}`, { recipe_id: recipeId, version });
  }
  const parsed = parseMarkdown(readFileSync(draftPath, "utf-8"));
  const meta = parsed.meta as unknown as RecipeMeta;
  if (meta.recipe_id !== recipeId || meta.version !== version) {
    throw dataInvalid("草稿内容与目标 recipe_id/version 不一致");
  }
  meta.status = "published";
  if (!meta.published_at) meta.published_at = today();

  const schemaCheck = validateFrontmatter(meta);
  if (!schemaCheck.ok) {
    throw dataInvalid(`frontmatter 校验失败: ${schemaCheck.message}`, { subject: draftPath });
  }
  const { allergenFixes } = reviewAgainstCatalog(meta, catalog, { requireCatalogEntries: true });
  if (allergenFixes.length) {
    meta.allergens = [...new Set([...meta.allergens, ...allergenFixes])].sort();
  }

  const targetPath = repo.resolveRecipePath(recipeId, version);
  if (existsSync(targetPath)) {
    throw conflict(`目标版本已存在（已发布版本不可覆盖）: ${targetPath}`, {
      recipe_id: recipeId,
      version,
    });
  }
  const state = repo.stateOf(recipeId);
  if (state && version <= state.currentVersion) {
    throw conflict(
      `目标版本 v${version} 不高于当前版本 v${state.currentVersion}`,
      { recipe_id: recipeId, version, current: state.currentVersion },
    );
  }

  repo.writeRecipe({ meta, body: parsed.body, relPath: `recipes/${recipeId}/v${version}.md` });
  repo.removeDraft(recipeId, version);
  return {
    recipeId,
    version,
    publishedPath: targetPath,
    allergenFixes,
  };
}

/** 归档：创建更高版本的完整快照并置 archived，不改旧版本（PRD §9.1）。 */
export function archiveRecipe(
  repo: KnowledgeRepo,
  catalog: CatalogIndex,
  recipeId: string,
  reason: string,
): { archivedVersion: number; path: string } {
  const state = repo.stateOf(recipeId);
  if (!state) throw notFound(`菜谱不存在: ${recipeId}`, { recipe_id: recipeId });
  if (state.currentStatus === "archived") {
    throw conflict(`${recipeId} 已是归档状态`);
  }
  const current = repo.getRecipe(recipeId, state.currentVersion);
  const nextVersion = state.currentVersion + 1;
  const meta: RecipeMeta = {
    ...current.meta,
    version: nextVersion,
    status: "archived",
    archived_reason: reason,
  };
  const targetPath = repo.resolveRecipePath(recipeId, nextVersion);
  repo.writeRecipe({
    meta,
    body: current.body,
    relPath: `recipes/${recipeId}/v${nextVersion}.md`,
  });
  return { archivedVersion: nextVersion, path: targetPath };
}

/** 从源文件创建下一版草稿到 drafts/。 */
export function createDraftFromSource(
  repo: KnowledgeRepo,
  sourcePath: string,
): { recipeId: string; version: number; draftPath: string } {
  if (!existsSync(sourcePath)) {
    throw invalidArgument(`源文件不存在: ${sourcePath}`);
  }
  const parsed = parseMarkdown(readFileSync(sourcePath, "utf-8"));
  const meta = parsed.meta as unknown as RecipeMeta;
  const schemaCheck = validateFrontmatter(meta);
  if (!schemaCheck.ok) {
    throw dataInvalid(`frontmatter 校验失败: ${schemaCheck.message}`, { subject: sourcePath });
  }
  const state = repo.stateOf(meta.recipe_id);
  const draftVersions = repo
    .scanDrafts()
    .filter((d) => d.meta.recipe_id === meta.recipe_id)
    .map((d) => d.meta.version);
  const maxKnown = Math.max(state?.currentVersion ?? 0, ...draftVersions, 0);
  const nextVersion = Math.max(maxKnown + 1, meta.version);
  const draftMeta: RecipeMeta = { ...meta, version: nextVersion, status: "draft" };
  delete draftMeta.published_at;
  const content = serializeMarkdown(
    draftMeta as unknown as Record<string, unknown>,
    parsed.body,
  );
  const draftPath = repo.writeDraft(meta.recipe_id, nextVersion, content);
  return { recipeId: meta.recipe_id, version: nextVersion, draftPath };
}

/** 知识库全量校验（启动与 CLI 共用）。 */
export function validateKnowledge(
  repo: KnowledgeRepo,
): { ok: boolean; problems: string[]; publishedCount: number } {
  const problems: string[] = [];
  let publishedCount = 0;
  try {
    repo.scanDrafts();
  } catch (e) {
    problems.push((e as Error).message);
  }
  let catalog: CatalogIndex;
  try {
    catalog = new CatalogIndex(repo.loadCatalog());
  } catch (e) {
    return { ok: false, problems: [(e as Error).message], publishedCount: 0 };
  }
  let ids: string[] = [];
  try {
    ids = [...repo.scan().keys()];
  } catch (e) {
    problems.push((e as Error).message);
    return { ok: false, problems, publishedCount };
  }
  for (const id of ids) {
    const state = repo.stateOf(id)!;
    try {
      if (state.currentStatus === "published") {
        const doc = repo.getRecipe(id, state.currentVersion);
        reviewAgainstCatalog(doc.meta, catalog, { requireCatalogEntries: false });
        publishedCount++;
      }
    } catch (e) {
      problems.push((e as Error).message);
    }
  }
  return { ok: problems.length === 0, problems, publishedCount };
}

/** 重建派生索引（可删除重建，非事实源）。 */
export function rebuildIndex(repo: KnowledgeRepo): { recipes: number; generatedAt: string } {
  const cacheDir = join(repo.knowledgeDir, "..", ".cache");
  mkdirSync(cacheDir, { recursive: true });
  const ids = [...repo.scan().keys()];
  const summary = {
    generated_at: new Date().toISOString(),
    recipes: ids.map((id) => {
      const state = repo.stateOf(id)!;
      return {
        recipe_id: id,
        current_version: state.currentVersion,
        status: state.currentStatus,
        versions: state.versions,
      };
    }),
  };
  writeFileSync(join(cacheDir, "index.json"), JSON.stringify(summary, null, 2), "utf-8");
  return { recipes: ids.length, generatedAt: summary.generated_at };
}
