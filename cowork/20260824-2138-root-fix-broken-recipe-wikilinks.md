# 修复替换/关系文档里指向旧菜谱文件名的失效双链

- Agent：root
- 时间：2026-08-24T21:38:00+08:00
- 状态：完成
- 任务：用户截图 Obsidian 关系图谱，发现中文菜谱节点（如"麻婆豆腐-v1"）是孤立的，且图谱里出现多个只标着"v1"的灰色幽灵节点。排查后确认：`substitutions/`、`relations/` 里全部 9 篇文档的正文双链和部分 frontmatter `evidence.source` 字段，仍然写的是重命名前的路径 `recipes/<id>/v1.md`（甚至是比 `[[20260824-2049-...]]` 那次改名更早、最原始的裸 `vN.md` 形态），此前两轮改名都没有同步更新这些引用。

## 根因

- Obsidian 的 `[[wikilink]]` 是按目标文件的实际路径/文件名解析的。`recipes/<id>/vN.md` 先后改名成 `recipes/<id>/<id>-vN.md` 再改成 `recipes/<id>/<菜名>-vN.md` 之后，`substitutions/`、`relations/` 正文里写死的 `[[recipes/tomato-eggs/v1|番茄炒蛋 v1]]` 这类链接，目标路径 `recipes/tomato-eggs/v1` 已经不对应任何真实文件。
- Obsidian 对无法解析的链接会在图谱里画一个"未解析"的灰色节点，默认显示链接路径的最后一段（也就是"v1"），这正是截图里那些孤立"v1"节点的来源。
- 中文菜谱节点本身显示为孤立，不是因为它们没有被任何东西引用，而是因为所有本该指向它们的链接实际上指向了这些不存在的"影子路径"，从未真正连接到中文节点。

## 修改

- `knowledge/menu/substitutions/tomato-eggs-scallion-omit-v1.md`、`smashed-cucumber-dried-chili-omit-v1.md`、`oat-porridge-sugar-omit-v1.md`：`evidence.source` 从 `recipes/<id>/v1.md#<章节>` 改为 `recipes/<id>/<菜名>-v1.md#<章节>`；正文 `[[recipes/<id>/v1|...]]` 改为 `[[recipes/<id>/<菜名>-v1|...]]`。
- `knowledge/menu/relations/` 全部 6 篇文档（`garlic-broccoli-choy-sum-alternative`、`mapo-tofu-choy-sum-pair`、`oat-porridge-egg-pancake-alternative`、`steamed-chicken-choy-sum-pair`、`steamed-chicken-sea-bass-alternative`、`tomato-eggs-garlic-broccoli-pair`）：正文里的两个菜谱双链同步改成 `<菜名>-v1` 形式。
- `tests/tool-contracts/schemas.test.ts`：一处 `evidence.source` 示例字符串同步更新为 `recipes/tomato-eggs/番茄炒蛋-v1.md`（上一轮改名时只改到了英文 id 阶段，这次补齐到中文阶段）。

## 验证

- 用 `Grep` 在整个 `knowledge/` 目录搜索 `recipes/<id>/v\d(\.md|\|)` 模式，确认 `knowledge/menu/` 下已无残留旧链接；唯一命中是 `knowledge/.obsidian/workspace.json`（用户在仓库根 `knowledge/` 下另一个独立 Obsidian 工作区的"最近打开标签页"状态文件，不属于 `knowledge/menu` 这个 MCP Vault，未处理）。
- PowerShell 逐字节校验全部 9 个被改动文件：null/控制字符计数均为 0。
- `npm test`：通过，72 项测试全部通过。
- `npm run recipe -- validate`：通过，"校验通过：16 道已发布菜谱"（wikilink 是 Obsidian 专用语法，不在 MCP schema 校验范围内，这次改动对 MCP 侧无影响，纯粹是人工浏览体验修复）。

## 遗留

- MCP/校验器完全不检查 Obsidian wikilink 是否可解析——这类断链只会在 Obsidian 图谱/预览里表现出来，不会被 `npm run recipe -- validate` 或服务启动校验捕获。以后每次重命名 `recipes/**` 下的文件，都必须记得同步搜索并修复 `substitutions/`、`relations/`、`首页.md` 等处的双链，这是一个容易再次踩中的坑，建议今后维护时养成"改完文件名就搜一遍旧文件名"的习惯。
