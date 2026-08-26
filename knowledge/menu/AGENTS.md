# 本目录（Obsidian Vault）的 Agent 说明

你现在的工作目录是 what2eat 知识库的 Obsidian Vault，是整个仓库的一个子目录（仓库根目录通常在 `../../`，比如通过 [Claudian](https://github.com/YishenTu) 之类的插件从 Obsidian 内直接打开时，你可能只能看到这个 Vault，看不到仓库根目录）。

**开始前先确认自己能看到多少**：尝试读 `../../AGENTS.md` 和 `../../MAINTENANCE.md`。

- 如果能读到：那两个文件是更完整的协作规则和维护清单，以它们为准，本文件只是本目录范围内的补充和离线兜底。
- 如果读不到（权限或路径不可达）：只能靠本文件里的内容工作，涉及仓库根目录代码/schema 的任务（下面"你做不了的事"列了具体范围）不要勉强，直接告诉用户需要换一个能访问完整仓库的会话来做。

## 这个 Vault 是什么

`recipes/`、`drafts/`、`ingredients/`、`substitutions/`、`prices/`——菜谱、食材目录、替换规则、维护者基准价，都是纯 Markdown + YAML frontmatter。这些文件同时被 MCP 服务读取，frontmatter 里的字段名和取值必须严格符合约定，不是随便写的笔记。

`relations/`（菜谱之间的搭配/替代关系）已经去掉了——配餐和整菜替代现在靠每篇菜谱自己的 `dish_role` 标签实时检索匹配，不再需要人工两两建关系。

## 核心规则（不确定就先别发布，问用户）

1. **已发布（`status: published`）版本默认不可原地修改**。要改内容，新建更高版本号的文件（比如从 v1 改到 v2）。只有真正的小改（错字、用量微调、补 `role`/`optional`/`defines_dish`/`dish_role` 这类标注）可以用 `npm run recipe -- revise <recipe_id> <version> <source.md> --minor-edit` 原地修订，不升版本；这个命令只对**当前生效版本**生效，旧版本和归档版本仍然真正不可变。拿不准算不算"小改"就按大改处理，走正常升版本流程。
2. 新内容先设 `status: draft`，经过校验和用户确认后再改 `published`。
3. 正文必须有三个非空章节：`## 做法`、`## 替换建议`、`## 储存与安全`，缺一个都不合法。
4. 食材替换规则（`substitutions/`）现在只用于真正"换成另一种食材"（`mode: replace`）的场景，必须说明适用菜谱/角色、做法变化、过敏原变化和依据——不能只写"可以换"。单纯"能不能整体不放"不再单独建文件，直接在菜谱自己的 `ingredients[].optional` + `notes` 里说明即可。
5. 涉及预算的判断都要重新算采购和报价，不能写死"便宜"这种结论——`dish_role` 匹配出的候选只表示"类型上可以互相替代"，不代表价格高低。
6. 涉及口味、能不能吃、算不算同一道菜这类判断，起草可以，但发布前必须让用户确认——这不是数据推导，是真实经验判断，你没吃过这道菜。

## 食材角色标注（`role` / `optional` / `defines_dish`）

`ingredients[]` 每项可以选填这三个字段，复用 `substitutions/` 已有的角色枚举，**不确定就不填，不要瞎猜**：

- `role`：`primary`（主料）| `supporting`（配料）| `seasoning`（调味）| `garnish`（点缀）| `cooking_medium`（油/介质）。购物清单按份数缩放时，`seasoning`/`garnish`/`cooking_medium` 是打折缩放（人数翻倍不等于用量翻倍），`primary`/`supporting` 才是线性缩放。
- `optional`：能不能整体不放。
- `defines_dish`：换掉/去掉后算不算同一道菜；`true` 的食材缺货时只能给整菜候选（按 `dish_role` 实时检索），不能包装成"同菜微调"。

现在全部 22 篇已发布菜谱都已经标注了这三个字段，参考任意一篇即可，比如 `recipes/tomato-eggs/番茄炒蛋-v1.md`。这是判断题，不是格式题——起草你的判断，但要让用户确认过之后再发布。

## 菜品角色标注（`dish_role`）

菜谱顶层（不是某个食材，是整道菜）可以选填这一个字段，用于配餐和整菜替代的实时检索匹配：

- `dish_role`：`protein`（荤/主菜）| `vegetable`（素菜/配菜）| `soup`（汤）| `staple`（主食：饭/面/粥）| `cold_dish`（凉菜）| `mixed`（荤素难分，比如蛋类/豆腐类主料但没肉或肉只是配料）| `other`（确实不属于以上任何一类）

不确定归哪一类就先不填——缺失时 `find_replacements` 会给出 `NO_DISH_ROLE_ON_BASE` 提示，整菜候选退化为不按分类过滤，不会报错，只是候选没那么精准。荤素界限不清楚的菜优先考虑 `mixed`，不要为了凑进 `protein`/`vegetable` 而勉强判断。

`mixed`/`other` 目前样本很少，同分类候选池小——查询时如果缺货食材恰好是这少数几篇的共同食材（比如都放了葱花点缀），可能出现"同分类候选被过滤到剩 0 个"的情况，这是分类样本少的真实局限，不是 bug，不需要为了避免它而乱归类。

## 新建/修改菜谱的标准流程

1. 用 `templates/recipe-template.md` 起草，`status: draft`。
2. 如果 `../../` 可达：在仓库根目录跑 `npm run recipe -- validate` 确认 schema、正文章节、引用都通过；`npm run recipe -- create-draft <文件路径>` 规范化进 `drafts/` 并定版本号；`npm run recipe -- publish <recipe_id> <version>` 发布（不可变，自动过敏原复核）。
3. 如果 `../../` 不可达（跑不了 `npm run`）：把草稿准备好、frontmatter 按 schema 要求填对，明确告诉用户"没法在这里跑校验和发布，需要你在完整仓库环境里跑一遍 `npm run recipe -- validate` / `publish`"，不要假装已经验证过或已经发布。

## 你做不了的事（需要完整仓库会话）

- 改 `specs/tools/*.schema.json`、`packages/recipe-domain/`、`mcp/server/`、`skills/meal-planning/`——这些都在这个 Vault 外面。
- 给 MCP 工具新增字段、改 HTML 渲染模板、改测试。
- 迭代 `PRD/`。

遇到这类需求，说明这个会话只能看到 Vault，建议用户换到能访问整个仓库的会话（比如终端里的 Claude Code），不要在这里勉强改仓库根目录以外的文件，也不要凭空猜测那些文件的内容。

更完整的分工说明（哪些信息该用户提供、哪些常规维护场景怎么处理）在 `../../MAINTENANCE.md`；本 Vault 内的人工向导版本是 [[维护说明]]。
