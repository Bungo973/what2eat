# Obsidian 菜谱模板与正文三段式校验

- Agent：root
- 时间：2026-08-24T20:37:00+08:00
- 状态：完成
- 任务：给知识库补一份 Obsidian 新建菜谱模板，并把现有 16 篇菜谱共同遵循但此前未被 schema 强制的"做法/替换建议/储存与安全"三段式正文结构，变成校验器强制项。

## 修改

- `knowledge/menu/templates/recipe-template.md`：新增，按 `recipe-frontmatter.schema.json` 必填字段给出可直接填写的骨架，正文固定三段式并附简短说明。
- `knowledge/menu/.obsidian/templates.json`：新增，把 Obsidian 核心 Templates 插件的模板目录指向 `templates`（该插件此前已启用但未配置目录）。
- `knowledge/menu/维护说明.md`：新增"新建菜谱"流程小节（Obsidian 模板 → validate → create-draft → publish），并在基本原则里补上三段式正文的硬性要求。
- `packages/recipe-domain/src/repo.ts`：`loadDocument()` 里原来只检查正文含非空 `## 做法`，现在改为用 `extractSections()` 按 `## 标题` 切分正文，要求 `做法`/`替换建议`/`储存与安全` 三个标题都存在且各自内容非空；三者缺一即在 `scan()`/`scanDrafts()`（发布菜谱与草稿共用同一入口）阶段报 `DATA_INVALID`。不检查标题顺序，只检查存在性与非空内容。
- `tests/recipe-domain.test.ts`：`mdFromMeta()` 的默认正文 fixture 补齐三段式，避免大量不关心正文内容的既有测试因新校验规则失败。

## 决定

- 只加"存在性 + 非空"校验，不强制三个标题的先后顺序，避免过度限制、并且现有 16 篇实际顺序一致，未来若有合理理由调整顺序不必额外改校验器。
- 模板目录 `knowledge/menu/templates/` 不在 `KnowledgeRepo` 的任何扫描范围内（`recipesRoot`/`draftsRoot`/`substitutionsRoot`/`relationsRoot`/`ingredients` 均未涉及），确认新增目录不会被误当成菜谱/草稿/替换规则解析。
- 未改动 `specs/knowledge/recipe-frontmatter.schema.json`（三段式是正文结构约定，不是 frontmatter 字段），也未改动 `specs/knowledge/obsidian-knowledge-base-sketch.md`（该文档明确是面向 v2 的设计草图，本次改动只是给当前 v1 schema 补校验，不属于草图范围）。

## 验证

- `npm test`：通过，6 个测试文件、71 项测试全部通过（先出现 16 项因正文 fixture 缺少新增两段而失败，修复 fixture 后全绿）。
- `npm run recipe -- validate`：通过，"校验通过：16 道已发布菜谱"——确认现有全部已发布菜谱本来就满足三段式要求，本次改动对存量数据零破坏。
- `npm run build`：通过（`skill:check` + 三个 workspace 的 `tsc --noEmit`）。

## 遗留

- 三段式只做了存在性校验，没有校验每段内容质量（例如"替换建议"是否真的写了有意义的内容，还是随手写了个占位符）；这类质量把关仍然依赖人工审核。
- Obsidian 模板里的 YAML 字段值是纯占位符，如果维护者直接用 Properties 面板（图形化属性编辑器）编辑而不是源码模式，需要注意面板可能不完全保留数组/嵌套结构的书写习惯；未做进一步处理，按现状交付。
- 用户在同一轮对话里还提出"菜谱文件名全是 v1.md，Obsidian 图谱里分不清"的问题，讨论后建议把文件名从 `recipes/<id>/vN.md` 改为 `recipes/<id>/<id>-vN.md`（与 `substitutions/`、`relations/` 现有命名风格对齐），但用户尚未确认是否执行，本次未改动，留待后续任务。
