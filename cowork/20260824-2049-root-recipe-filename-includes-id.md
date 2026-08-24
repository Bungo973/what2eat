# 菜谱文件名加 recipe_id 前缀（解决 Obsidian 图谱同名 v1 问题）

- Agent：root
- 时间：2026-08-24T20:49:00+08:00
- 状态：完成
- 任务：用户反馈 Obsidian 图谱里 16 篇菜谱的文件都叫 `v1.md`，图谱节点/快速切换器无法区分是哪道菜。经讨论确认后执行：把菜谱文件名从 `recipes/<recipe_id>/vN.md` 改为 `recipes/<recipe_id>/<recipe_id>-vN.md`，与 `substitutions/`、`relations/`、`drafts/` 现有的 `<id>-vN.md` 命名风格对齐，同步修改领域层代码、测试与相关文档。

## 修改

- `packages/recipe-domain/src/repo.ts`：
  - `scan()` 里菜谱文件名校验从固定正则 `/^v(\d+)\.md$/` 改为按目录名动态生成的 `^${dir.name}-v(\d+)\.md$`，文件名必须以所在文件夹的 recipe_id 为前缀；错误提示同步更新。
  - `resolveRecipePath(recipeId, version)`：目标文件名从 `` `v${version}.md` `` 改为 `` `${recipeId}-v${version}.md` ``（路径穿越校验逻辑不变）。
  - 新增 `escapeRegExp()` 工具函数，避免 recipe_id 里理论上的正则特殊字符被当作正则语法（虽然 `RECIPE_ID_RE` 限定字符集已经很窄，仍按防御性写法处理）。
  - 类文档注释同步更新为新命名约定。
- `packages/recipe-domain/src/publish.ts`：`publishDraft()`、`archiveRecipe()` 里传给 `writeRecipe()` 的 `relPath` 字段同步改成新文件名格式（该字段目前只用于内部错误信息，未被外部消费，但保持语义正确）。
- `knowledge/menu/recipes/**`：批量重命名全部 16 篇已发布菜谱文件，例如 `recipes/mapo-tofu/v1.md` → `recipes/mapo-tofu/mapo-tofu-v1.md`；只改文件名，未改动任何 frontmatter 或正文内容。
- `README.md`、`knowledge/menu/首页.md`、`specs/knowledge/obsidian-knowledge-base-sketch.md`：同步更新命名约定描述。
- `tests/recipe-domain.test.ts`：测试夹具 `writePublished()` 写入路径、路径安全测试的正则断言同步改成新命名。
- `tests/tool-contracts/schemas.test.ts`：一处 `evidence.source` 示例字符串路径同步更新（不影响契约校验本身，纯粹保持示例真实可对应）。

## 决定

- **不修改 `PRD/AI原生菜谱Agent-PRD-V0.4.md`**。该文件 §5.1 明确写着 `recipes/<recipe_id>/v<version>.md`，按 AGENTS.md"历史版本只读、迭代需新建更高版本文件"的规则，纠正/变更这条目录约定理论上需要一份 V0.5 说明变更摘要，而不是回改 V0.4。本次改动不涉及 MCP 对外工具契约（`recipe_id`/`version` 字段行为不变，纯粹是知识库内部存储文件名格式），我判断这是实现细节而非产品语义变更，因此只在 `specs/knowledge/obsidian-knowledge-base-sketch.md` 和本记录里说明，未主动新建 PRD 版本；**这条 PRD 与实现之间的文字不一致，留给用户决定是否需要专门发一版 PRD 记录**。
- 只在 `recipes/` 目录做这个改动。`drafts/`、`substitutions/`、`relations/` 原本就是 `<id>-vN.md` 扁平命名，不受影响。
- 用 "按目录名动态生成正则" 而不是一个通用的 `^([a-z0-9-]+)-v(\d+)\.md$` 捕获式正则，是为了避免 recipe_id 本身含连字符时（如 `steamed-sea-bass`）通用正则对前缀的贪婪匹配产生歧义；动态按 `dir.name` 精确锚定文件名更明确、错误信息也更直接。

## 验证

- `npm test`：通过，6 个测试文件、71 项测试全部通过（`tests/server.test.ts`、`tests/agent-scenarios/scenarios.test.ts` 走的是真实 `knowledge/menu` 数据，重命名后一并验证了实际知识库可被正常加载）。
- `npm run recipe -- validate`：通过，"校验通过：16 道已发布菜谱"。
- `npm run build`：通过（`skill:check` + 三个 workspace 的 `tsc --noEmit`）。

## 遗留

- PRD V0.4 §5.1 文本与当前实现的文件名格式不一致（见"决定"），是否需要发布 PRD V0.5 记录这条变更，留给用户决定。
- `[[20260824-2037-root-recipe-template-and-body-validation]]` 记录里提到的这个命名改造，在本记录中正式执行完成。
