import {
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { dirname, isAbsolute, join, relative, resolve } from "node:path";
import { stringify as yamlStringify } from "yaml";
import { parseMarkdown } from "./markdown.ts";
import { dataInvalid, invalidArgument, notFound } from "./errors.ts";
import {
  validateCatalog,
  validateFrontmatter,
  validateSubstitution,
} from "./schema.ts";
import type {
  IngredientCatalog,
  RecipeDocument,
  RecipeMeta,
  RecipeStatus,
  RecipeState,
  SubstitutionRule,
} from "./types.ts";

const RECIPE_ID_RE = /^[a-z0-9][a-z0-9-]*$/;

/** Windows/大多数文件系统不允许作为文件名的字符。 */
const FILENAME_UNSAFE_RE = /[<>:"/\\|?*]/g;

/** 由 frontmatter name 派生文件名前缀：过滤非法字符、去除首尾空白，结果为空则拒绝。 */
function sanitizeFilenameSegment(name: string, subject: string): string {
  const cleaned = name.trim().replace(FILENAME_UNSAFE_RE, "").replace(/\.+$/, "");
  if (!cleaned) {
    throw dataInvalid(`菜谱名称清理为合法文件名后为空: ${name}`, { subject });
  }
  return cleaned;
}

/** 正文必须包含的三段式结构（与现有全部已发布菜谱的实际写法一致）。 */
const REQUIRED_BODY_SECTIONS = ["做法", "替换建议", "储存与安全"];

/** 按 `## 标题` 切分正文，返回标题到其后内容（不含标题行）的映射。 */
function extractSections(body: string): Map<string, string> {
  const sections = new Map<string, string[]>();
  let current: string | null = null;
  for (const line of body.split(/\r?\n/)) {
    const heading = /^##\s+(.+)$/.exec(line.trim());
    if (heading) {
      current = heading[1]!.trim();
      if (!sections.has(current)) sections.set(current, []);
      continue;
    }
    if (current) sections.get(current)!.push(line);
  }
  return new Map([...sections].map(([name, lines]) => [name, lines.join("\n")]));
}

/**
 * Markdown 菜谱知识库仓储：扫描 recipes/ 与 drafts/，实现版本状态机与受控路径解析。
 *
 * 版本状态机（PRD §9.1）：
 * - recipes/<id>/<菜名>-vN.md 为非草稿版本，不可变（文件夹名仍是稳定的 recipe_id，
 *   文件名前缀改用 frontmatter 里的中文 name，避免 Obsidian 图谱/快速切换器里
 *   全部显示成同名英文 slug 或同名 "v1" 节点）；
 * - 当前状态由最高非草稿版本决定；
 * - drafts/*.md 为草稿，不进入公共读取范围。
 */
export class KnowledgeRepo {
  readonly knowledgeDir: string;
  private recipesCache: Map<string, Map<number, RecipeDocument>> | null = null;
  private draftsCache: RecipeDocument[] | null = null;
  private catalogCache: IngredientCatalog | null = null;
  private substitutionsCache: SubstitutionRule[] | null = null;

  constructor(knowledgeDir: string) {
    this.knowledgeDir = knowledgeDir;
  }

  get recipesRoot(): string {
    return join(this.knowledgeDir, "recipes");
  }

  get draftsRoot(): string {
    return join(this.knowledgeDir, "drafts");
  }

  get substitutionsRoot(): string {
    return join(this.knowledgeDir, "substitutions");
  }

  /** 扫描全部菜谱与草稿，带结构校验。 */
  scan(): Map<string, Map<number, RecipeDocument>> {
    if (this.recipesCache) return this.recipesCache;
    const byId = new Map<string, Map<number, RecipeDocument>>();
    if (existsSync(this.recipesRoot)) {
      for (const dir of readdirSync(this.recipesRoot, { withFileTypes: true })) {
        if (!dir.isDirectory()) continue;
        if (!RECIPE_ID_RE.test(dir.name)) {
          throw dataInvalid(`菜谱目录名不合法: ${dir.name}`, { subject: dir.name });
        }
        for (const file of readdirSync(join(this.recipesRoot, dir.name))) {
          const versionMatch = /^(.+)-v(\d+)\.md$/.exec(file);
          if (!versionMatch) {
            throw dataInvalid(`菜谱文件名必须形如 <菜名>-vN.md: ${dir.name}/${file}`);
          }
          const doc = this.loadDocument(
            join(this.recipesRoot, dir.name, file),
            `recipes/${dir.name}/${file}`,
          );
          const meta = doc.meta;
          if (meta.recipe_id !== dir.name) {
            throw dataInvalid(
              `frontmatter recipe_id (${meta.recipe_id}) 与目录名 (${dir.name}) 不一致`,
              { subject: `recipes/${dir.name}/${file}` },
            );
          }
          if (meta.version !== Number(versionMatch[2])) {
            throw dataInvalid(
              `frontmatter version (${meta.version}) 与文件名 ${file} 不一致`,
              { subject: `recipes/${dir.name}/${file}` },
            );
          }
          const expectedPrefix = sanitizeFilenameSegment(meta.name, `recipes/${dir.name}/${file}`);
          if (versionMatch[1] !== expectedPrefix) {
            throw dataInvalid(
              `文件名前缀 (${versionMatch[1]}) 与 frontmatter name 派生的文件名 (${expectedPrefix}) 不一致: recipes/${dir.name}/${file}`,
              { subject: `recipes/${dir.name}/${file}` },
            );
          }
          if (meta.status === "draft") {
            throw dataInvalid(`已发布目录中不允许草稿状态: recipes/${dir.name}/${file}`);
          }
          if (!meta.published_at) {
            throw dataInvalid(`published/archived 状态缺少 published_at: recipes/${dir.name}/${file}`);
          }
          let versions = byId.get(meta.recipe_id);
          if (!versions) {
            versions = new Map();
            byId.set(meta.recipe_id, versions);
          }
          if (versions.has(meta.version)) {
            throw dataInvalid(`版本重复: ${meta.recipe_id} v${meta.version}`);
          }
          versions.set(meta.version, doc);
        }
      }
    }
    this.recipesCache = byId;
    return byId;
  }

  scanDrafts(): RecipeDocument[] {
    if (this.draftsCache) return this.draftsCache;
    const drafts: RecipeDocument[] = [];
    if (existsSync(this.draftsRoot)) {
      for (const file of readdirSync(this.draftsRoot)) {
        if (!file.endsWith(".md")) continue;
        const doc = this.loadDocument(join(this.draftsRoot, file), `drafts/${file}`);
        if (doc.meta.status !== "draft") {
          throw dataInvalid(`drafts/ 中只允许 draft 状态: drafts/${file}`);
        }
        drafts.push(doc);
      }
    }
    this.draftsCache = drafts;
    return drafts;
  }

  loadCatalog(): IngredientCatalog {
    if (this.catalogCache) return this.catalogCache;
    const dir = join(this.knowledgeDir, "ingredients");
    if (!existsSync(dir)) {
      throw notFound("食材目录缺失: <knowledge-root>/ingredients/");
    }
    const files = readdirSync(dir).filter((f) => f.endsWith(".md"));
    if (files.length === 0) {
      throw notFound("食材目录为空");
    }
    const doc = this.loadRawDocument(join(dir, files[0]!), `ingredients/${files[0]}`);
    const catalog = doc.meta as unknown as IngredientCatalog;
    const result = validateCatalog(catalog);
    if (!result.ok) {
      throw dataInvalid(`食材目录 schema 校验失败: ${result.message}`, { subject: files[0]! });
    }
    const ids = new Set<string>();
    for (const ing of catalog.ingredients) {
      if (ids.has(ing.id)) {
        throw dataInvalid(`食材 ID 重复: ${ing.id}`);
      }
      ids.add(ing.id);
    }
    this.catalogCache = catalog;
    return catalog;
  }

  loadSubstitutions(): SubstitutionRule[] {
    if (this.substitutionsCache) return this.substitutionsCache;
    if (!existsSync(this.substitutionsRoot)) {
      this.substitutionsCache = [];
      return [];
    }
    const out: SubstitutionRule[] = [];
    const seen = new Set<string>();
    for (const file of readdirSync(this.substitutionsRoot).filter((name) => name.endsWith(".md"))) {
      const match = /^([a-z][a-z0-9-]*)-v(\d+)\.md$/.exec(file);
      if (!match) throw dataInvalid(`替换规则文件名必须形如 <id>-vN.md: ${file}`);
      const raw = this.loadRawDocument(join(this.substitutionsRoot, file), `substitutions/${file}`);
      const check = validateSubstitution(raw.meta);
      if (!check.ok) {
        throw dataInvalid(`替换规则 schema 校验失败: ${check.message}`, { subject: file });
      }
      const rule = raw.meta as SubstitutionRule;
      if (rule.substitution_id !== match[1] || rule.version !== Number(match[2])) {
        throw dataInvalid(`替换规则 ID/版本与文件名不一致: ${file}`, { subject: file });
      }
      if (rule.mode === "omit" && rule.to_ingredient !== null) {
        throw dataInvalid(`omit 规则的 to_ingredient 必须为 null: ${file}`, { subject: file });
      }
      if (rule.mode === "replace" && rule.to_ingredient === null) {
        throw dataInvalid(`replace 规则必须提供 to_ingredient: ${file}`, { subject: file });
      }
      if (rule.status !== "draft" && !rule.published_at) {
        throw dataInvalid(`已发布/归档替换规则缺少 published_at: ${file}`, { subject: file });
      }
      const key = `${rule.substitution_id}@${rule.version}`;
      if (seen.has(key)) throw dataInvalid(`替换规则版本重复: ${key}`);
      seen.add(key);
      out.push(rule);
    }
    this.substitutionsCache = out;
    return out;
  }

  listPublishedSubstitutions(): SubstitutionRule[] {
    return latestPublished(this.loadSubstitutions(), (item) => item.substitution_id);
  }

  /** 某菜谱的当前状态：最高非草稿版本决定。 */
  stateOf(recipeId: string): RecipeState | null {
    const versions = this.scan().get(recipeId);
    if (!versions || versions.size === 0) return null;
    const sorted = [...versions.keys()].sort((a, b) => a - b);
    const currentVersion = sorted[sorted.length - 1]!;
    const current = versions.get(currentVersion)!;
    const draftVersions = this.scanDrafts()
      .filter((d) => d.meta.recipe_id === recipeId)
      .map((d) => d.meta.version)
      .sort((a, b) => a - b);
    return {
      recipeId,
      versions: sorted,
      currentVersion,
      currentStatus: current.meta.status === "archived" ? "archived" : "published",
      draftVersions,
    };
  }

  /**
   * 受控路径解析：只允许 recipe_id 目录与 <菜名>-vN.md 文件名，杜绝目录穿越。
   */
  resolveRecipePath(recipeId: string, version: number, name: string): string {
    if (!RECIPE_ID_RE.test(recipeId) || !Number.isInteger(version) || version < 1) {
      throw invalidArgument("recipe_id 或 version 不合法", { recipe_id: recipeId, version });
    }
    const filenamePrefix = sanitizeFilenameSegment(name, recipeId);
    const path = resolve(this.recipesRoot, recipeId, `${filenamePrefix}-v${version}.md`);
    const rel = relative(resolve(this.recipesRoot), path);
    if (rel === "" || rel.startsWith("..") || isAbsolute(rel)) {
      throw invalidArgument("路径解析越界", { recipe_id: recipeId });
    }
    return path;
  }

  /** 读取指定版本；version 缺省为当前发布版本。草稿不可读。 */
  getRecipe(recipeId: string, version?: number | null): RecipeDocument {
    const state = this.stateOf(recipeId);
    if (!state) {
      throw notFound(`菜谱不存在: ${recipeId}`, { recipe_id: recipeId });
    }
    const target = version ?? state.currentVersion;
    if (!state.versions.includes(target)) {
      throw notFound(`版本不存在: ${recipeId} v${target}`, {
        recipe_id: recipeId,
        version: target,
        available_versions: state.versions,
      });
    }
    return this.scan().get(recipeId)!.get(target)!;
  }

  /** 当前处于 published 状态的菜谱（检索与公共读取范围）。 */
  listPublished(): Array<{ doc: RecipeDocument; state: RecipeState }> {
    const out: Array<{ doc: RecipeDocument; state: RecipeState }> = [];
    for (const [id] of this.scan()) {
      const state = this.stateOf(id)!;
      if (state.currentStatus !== "published") continue;
      out.push({ doc: this.getRecipe(id, state.currentVersion), state });
    }
    return out.sort((a, b) => a.doc.meta.recipe_id.localeCompare(b.doc.meta.recipe_id));
  }

  writeRecipe(doc: RecipeDocument): void {
    const path = this.resolveRecipePath(doc.meta.recipe_id, doc.meta.version, doc.meta.name);
    mkdirSync(dirname(path), { recursive: true });
    writeFileSync(path, serializeDoc(doc), "utf-8");
    this.invalidate();
  }

  writeDraft(recipeId: string, version: number, content: string): string {
    if (!RECIPE_ID_RE.test(recipeId) || !Number.isInteger(version) || version < 1) {
      throw invalidArgument("recipe_id 或 version 不合法");
    }
    mkdirSync(this.draftsRoot, { recursive: true });
    const path = join(this.draftsRoot, `${recipeId}-v${version}.md`);
    if (existsSync(path)) {
      throw dataInvalid(`草稿已存在: ${path}`);
    }
    writeFileSync(path, content, "utf-8");
    this.invalidate();
    return path;
  }

  removeDraft(recipeId: string, version: number): void {
    const path = join(this.draftsRoot, `${recipeId}-v${version}.md`);
    if (existsSync(path)) {
      rmSync(path);
    }
  }

  invalidate(): void {
    this.recipesCache = null;
    this.draftsCache = null;
    this.catalogCache = null;
    this.substitutionsCache = null;
  }

  private loadDocument(absPath: string, relPath: string): { meta: RecipeMeta; body: string; relPath: string } {
    const raw = this.loadRawDocument(absPath, relPath);
    const result = validateFrontmatter(raw.meta);
    if (!result.ok) {
      throw dataInvalid(`${relPath}: frontmatter 校验失败: ${result.message}`, { subject: relPath });
    }
    const meta = raw.meta as RecipeMeta;
    const sections = extractSections(raw.body);
    for (const name of REQUIRED_BODY_SECTIONS) {
      const content = sections.get(name);
      if (content === undefined || !/\S/.test(content)) {
        throw dataInvalid(`${relPath}: 正文必须包含非空"${name}"章节`, { subject: relPath });
      }
    }
    return { meta, body: raw.body, relPath };
  }

  /** 解析 frontmatter 文档但不套菜谱 schema（供食材目录、基准价等知识文档使用）。 */
  private loadRawDocument(absPath: string, relPath: string): { meta: unknown; body: string } {
    let raw: string;
    try {
      raw = readFileSync(absPath, "utf-8");
    } catch {
      throw notFound(`文件不存在: ${relPath}`);
    }
    try {
      return parseMarkdown(raw);
    } catch (e) {
      throw dataInvalid(`${relPath}: ${(e as Error).message}`, { subject: relPath });
    }
  }
}

function latestPublished<T extends { version: number; status: RecipeStatus }>(
  items: T[],
  idOf: (item: T) => string,
): T[] {
  const latest = new Map<string, T>();
  for (const item of items) {
    const id = idOf(item);
    const previous = latest.get(id);
    if (!previous || item.version > previous.version) latest.set(id, item);
  }
  return [...latest.values()].filter((item) => item.status === "published");
}

function serializeDoc(doc: RecipeDocument): string {
  const yamlText = yamlStringify(doc.meta as unknown as Record<string, unknown>, { lineWidth: 100 });
  const body = doc.body.startsWith("\n") || doc.body === "" ? doc.body : `\n${doc.body}`;
  return `---\n${yamlText.trimEnd()}\n---${body.endsWith("\n") ? body : `${body}\n`}`;
}
