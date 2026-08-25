# 维护清单

面向未来的 AI 会话和你自己：这个项目往后主要靠 AI 维护，你只需要在下面列出的地方提供信息或做判断。开始任何维护任务前，AI 应先读 [`AGENTS.md`](AGENTS.md)（协作规则）、`PRD/` 中最新版本、`cowork/` 下最近几条记录，再读本文件里对应的场景。

## 分工原则

- **你负责**：只有你亲身经历过（做过这道菜、买过这批食材、被这个约束卡住过）才知道的事实和判断。
- **AI 负责**：从这些事实出发起草、实现、跑校验/测试，发布前把草稿给你确认，并按 `AGENTS.md` 留下 `cowork/` 记录。
- 原则上没有"AI 直接替你决定口味/取舍然后默认发布"这回事——涉及内容判断的都要经过你过一遍草稿。

## 只有你能提供的信息

| 信息 | 为什么 AI 判断不了 |
| --- | --- |
| 新菜谱本身（哪道菜、怎么做） | 这是你实际做过或想收录的菜，AI 不能凭空编 |
| "这个食材能不能省/换"的真实口味判断 | AI 能起草替换规则草稿，但"换了以后好不好吃"只有你试过才知道 |
| "换了算不算另一道菜"（`defines_dish`） | 同上，是口味/身份判断，不是数据推导 |
| 两道菜适不适合搭配、是不是同一道菜的变体 | 同上 |
| 过敏原、忌口、预算等约束的变化 | 这是你和家人的真实情况 |
| 对 AI 起草内容的最终确认 | 发布前的最后一道关，见下方"常见维护场景" |
| 有主观取舍、没有标准答案的产品决定 | 例如之前"标题字体要不要牺牲离线能力换 Google Fonts"这类问题，AI 会给推荐但由你拍板 |

## AI 能自主完成的

- 从菜谱正文/你提供的描述起草 `role`/`optional`/`defines_dish`、替换规则、菜谱关系，走 `create-draft` → `publish` 流程（不直接改已发布版本）。
- 补食材目录条目（单位换算、过敏原标签），但价格查询词等涉及真实市场数据源的部分需要你或后续核价确认。
- 跑 `npm run recipe -- validate`、`npm test`、`npm run typecheck`、`npm run skill:build`/`skill:check`，保证改动不破坏契约。
- 同步 `specs/behavior/*.md` → `skills/meal-planning/references/*.md`。
- HTML 模板的视觉/文案小调整（配色、间距、措辞），只要不改变 `specs/tools/render-meal-plan-html.input.schema.json` 的字段含义。
- 按 `AGENTS.md` 要求新增 `cowork/` 记录。

## 常见维护场景

| 场景 | 你要做的 | AI 会做的 | 涉及文件 |
| --- | --- | --- | --- |
| 新增一道菜 | 提供菜谱内容；AI 起草后确认能不能吃、步骤对不对 | 起草 frontmatter（含 `role`/`optional`/`defines_dish`）、走发布流程、跑 `validate` | `knowledge/menu/recipes/<id>/` |
| 改已发布菜谱的内容 | 说明要改什么 | `create-draft` 出新版本、改动、发布；**不直接改旧版本**（已发布不可变） | 同上 |
| 遇到"这个食材没有/不想吃，能不能做"但知识库没覆盖 | 试过之后告诉 AI 效果如何 | 起草 `substitution` 规则草稿，你确认后发布 | `knowledge/menu/substitutions/` |
| 想让两道菜产生"变体/搭配/吃剩了怎么用"的关系 | 确认关系是否成立 | 起草 `recipe-relation`，你确认后发布 | `knowledge/menu/relations/` |
| 出现目录里没有的新食材 | 无（除非价格来源有特殊情况） | 补目录条目（换算、过敏原、价格查询词） | `knowledge/menu/ingredients/ingredients.md` |
| 给某个 MCP 工具新增字段 | 说清楚这个字段要干什么 | 同步改四处：`specs/tools/*.schema.json` → 对应 TS 类型/实现 → `specs/behavior/*.md`（如果影响表达）→ 测试；这是本次加 `optional` 字段时走的模式，以后照做 | 视工具而定 |
| 想调 HTML 视觉/文案 | 给方向或反馈（可以像上次一样来回看预览） | 改 `packages/recipe-domain/src/html.ts`，跑测试 | `packages/recipe-domain/src/html.ts` |
| 积累了几个"设计方向 2 本能解决但现在解决不了"的真实换菜场景 | 描述这些场景 | 评估是否启动 PRD V0.5 设计方向 2（通用规则 + 置信度分层） | 见下 |

## 何时重新评估已搁置的方向（PRD V0.5）

- **设计方向 2**（通用角色规则 + 置信度分层）：现在只有 2 篇菜谱有角色标注，样本太少。积累了几个"如果有通用规则就能答上"的真实场景后再评估，别在没有真实场景前先做。
- **设计方向 3**（食材功能分组）：明确搁置。菜谱规模从 16 道显著增长（比如到上百道）、手写替换规则的维护成本变得不可控时才重新考虑。
- **设计方向 4**（菜谱关系结构化维度 `balance_dimensions`）：风险收益独立，随时可以单独评审，不依赖方向 2/3。

## 日常健康检查（AI 自查，不需要你介入）

改了知识库数据：`npm run recipe -- validate`。改了代码/schema：`npm test` + `npm run typecheck`。改了 `specs/behavior/*.md`：`npm run skill:build && npm run skill:check`。这几条应该在每次相关改动后自动跑，不用等你提醒。
