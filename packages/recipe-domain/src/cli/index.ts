#!/usr/bin/env node
import { defaultKnowledgeDir } from "../paths.ts";
import { KnowledgeRepo } from "../repo.ts";
import { CatalogIndex } from "../catalog.ts";
import { ToolError } from "../errors.ts";
import {
  archiveRecipe,
  createDraftFromSource,
  publishDraft,
  rebuildIndex,
  validateKnowledge,
} from "../publish.ts";

const HELP = `what2eat 维护者 CLI（PRD §11）

用法：
  npm run recipe -- validate                校验知识库
  npm run recipe -- create-draft <file.md>  从源文档创建下一版草稿
  npm run recipe -- publish <recipe_id> <version>  发布草稿为不可变版本
  npm run recipe -- archive <recipe_id> --reason "原因"  归档菜谱
  npm run recipe -- rebuild-index           重建派生索引

环境变量：WHAT2EAT_KNOWLEDGE_DIR 覆盖知识库目录。`;

function main(): void {
  const [cmd, ...rest] = process.argv.slice(2);
  const repo = new KnowledgeRepo(defaultKnowledgeDir());
  try {
    switch (cmd) {
      case "validate": {
        const result = validateKnowledge(repo);
        for (const problem of result.problems) console.error(`- ${problem}`);
        console.log(
          result.ok
            ? `校验通过：${result.publishedCount} 道已发布菜谱`
            : `校验失败：${result.problems.length} 个问题`,
        );
        process.exitCode = result.ok ? 0 : 1;
        return;
      }
      case "create-draft": {
        const file = rest[0];
        if (!file) throw new ToolError("INVALID_ARGUMENT", "缺少源文件参数");
        const r = createDraftFromSource(repo, file);
        console.log(`草稿已创建: ${r.draftPath}（${r.recipeId} v${r.version}）`);
        return;
      }
      case "publish": {
        const [id, versionStr] = rest;
        const version = Number(versionStr);
        if (!id || !Number.isInteger(version)) {
          throw new ToolError("INVALID_ARGUMENT", "用法: publish <recipe_id> <version>");
        }
        const catalog = new CatalogIndex(repo.loadCatalog());
        const r = publishDraft(repo, catalog, id, version);
        console.log(`已发布: ${r.publishedPath}`);
        if (r.allergenFixes.length) {
          console.log(`过敏原复核补充: ${r.allergenFixes.join(", ")}`);
        }
        return;
      }
      case "archive": {
        const id = rest[0];
        const reasonIdx = rest.indexOf("--reason");
        const reason = reasonIdx >= 0 ? rest[reasonIdx + 1] : "";
        if (!id || !reason) {
          throw new ToolError("INVALID_ARGUMENT", '用法: archive <recipe_id> --reason "原因"');
        }
        const catalog = new CatalogIndex(repo.loadCatalog());
        const r = archiveRecipe(repo, catalog, id, reason);
        console.log(`已归档: ${r.path}（v${r.archivedVersion}）`);
        return;
      }
      case "rebuild-index": {
        const r = rebuildIndex(repo);
        console.log(`索引已重建: ${r.recipes} 个菜谱 @ ${r.generatedAt}`);
        return;
      }
      default:
        console.log(HELP);
        process.exitCode = cmd ? 1 : 0;
        return;
    }
  } catch (e) {
    if (e instanceof ToolError) {
      console.error(`[${e.code}] ${e.message}`);
      process.exitCode = 1;
      return;
    }
    throw e;
  }
}

main();
