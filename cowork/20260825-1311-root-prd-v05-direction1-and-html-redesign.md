# PRD V0.5 设计方向 1 落地 + render_meal_plan_html 手账风格重设计

- Agent：root
- 时间：2026-08-25T13:11:00+08:00
- 状态：完成
- 任务：落地 PRD V0.5「设计方向 1」（食材角色/可省性/`defines_dish`），补上对应的 Skill 用户表达契约，并按用户要求把 `render_meal_plan_html` 从表格/卡片式布局重做成手账风格（washi tape 卡片、可勾选采购清单、大白话文案），全程用真实菜谱数据验证。

## 修改

- `specs/knowledge/recipe-frontmatter.schema.json`：`ingredients[]` 新增可选 `role`/`optional`/`defines_dish` 字段，向后兼容。
- `packages/recipe-domain/src/types.ts`：`IngredientLine` 同步新增这三个可选字段。
- `packages/recipe-domain/src/replacement.ts`：`find_replacements` 对 `defines_dish: true` 的食材，无论是否按缺货筛选都排除同菜谱内的省略/替换候选，只留整菜候选；新增警告码 `DISH_DEFINING_INGREDIENT_UNAVAILABLE`。
- `specs/tools/read-recipe.output.schema.json`：`parsed.ingredients` 放开 `additionalProperties`，允许透传 `role`/`optional`/`defines_dish`（此前会被 schema 拒绝，属于遗漏，顺带修复）。
- `specs/behavior/user-output.md`：新增"换菜与替换"一节，规定 `DISH_DEFINING_INGREDIENT_UNAVAILABLE`/已发布规则/`NO_CURATED_REPLACEMENT`/`derived` 候选四种情形各自的措辞规则；另补一句要求 `optional: true` 从 `read_recipe` 原样带到 `render_meal_plan_html`。
- `specs/behavior/meal-planning.md`：工具路由表 `find_replacements` 行补充 `defines_dish` 规则指针；§4.3 局部换菜工作流补一句硬约束。
- `skills/meal-planning/references/{meal-planning,user-output}.md`：`npm run skill:build` 同步生成。
- `knowledge/menu/recipes/tomato-eggs/番茄炒蛋-v2.md`、`knowledge/menu/recipes/smashed-cucumber/拍黄瓜-v2.md`：试点回填 `role`/`optional`/`defines_dish`，依据是各自菜谱正文的"替换建议"章节；通过 `create-draft`→编辑→`publish` 流程发布，v1 保持不可变。
- `packages/recipe-domain/src/html.ts`：`renderMealPlanHtml` 重写为手账风格（washi-tape 圆角卡片、原生 `<input type="checkbox">` 采购清单、大白话文案，去掉原来的表格/`<details>` 布局）；食材行按 `optional` 显示"可省"标签。
- `specs/tools/render-meal-plan-html.input.schema.json`：`recipes[].ingredients[]` 新增可选 `optional` 字段。
- `tests/recipe-domain.test.ts`：新增 `defines_dish` 排除逻辑的 3 个用例、frontmatter schema 契约用例；更新 `render_meal_plan_html` 用例断言为新文案。
- `tests/tool-contracts/schemas.test.ts`：新增 frontmatter `role`/`optional`/`defines_dish` 契约用例。
- `tests/agent-scenarios/scenarios.test.ts`：更新 HTML 渲染用例的标题断言为新文案（"今天吃这些"/"怎么做"/"要买什么"/"大概花多少钱"）。

## 决定

- 设计方向 2（通用角色规则 + 置信度分层）本轮不落地，`replacement.ts` 里"通用规则永不生效"的保守判断原样保留；PRD 已写明先验证少量真实场景再决定。
- 试点回填限定在 `tomato-eggs`、`smashed-cucumber` 两篇（已有测试覆盖，且用户明确要求端到端验证），其余 14 篇留空，不做批量默认赋值。
- `render_meal_plan_html` 的标题类文字（`<h1>`/`<h2>`/食材栏标签）接入 Google Fonts（ZCOOL KuaiLe），正文与数字保持系统字体栈；这是与用户明确讨论过的取舍——保住"自包含离线可用"的核心承诺（正文/食材/做法/价格离线仍可读），只让装饰性标题在无网时退化为系统黑体。
- 采购清单复选框为纯前端交互（原生 checkbox + `:checked` 选择器），不写 JS、不做持久化，符合用户"不需要记录数据"的要求。

## 验证

- `npm run typecheck`：通过。
- `npm test`（76 个用例）：全部通过。
- `npm run recipe -- validate`：`校验通过：16 道已发布菜谱`。
- `npm run skill:build && npm run skill:check`：`Skill 引用已同步`。
- 用真实知识库数据（非测试 fixture）直接调用 `findReplacements`，核对番茄炒蛋缺番茄/缺大葱、拍黄瓜缺黄瓜三种场景的 `substitutions`/`recipe_alternatives`/`warnings` 均符合预期。
- 用真实菜谱数据（含 `optional` 字段）直接调用 `renderMealPlanHtml` 生成完整 HTML，人工核对"可省"标签位置、复选框 id 唯一性、转义安全，并发给用户在真实浏览器中查看确认。

## 遗留

- 其余 14 篇已发布菜谱尚未回填 `role`/`optional`/`defines_dish`，按 PRD 允许分批进行；缺失时通用规则匹配会保守跳过。
- 设计方向 2/3/4 均未启动，触发条件见新增的 `MAINTENANCE.md`。
- `render_meal_plan_html` 的标题字体依赖 Google Fonts CDN；如果未来判断这个取舍不可接受，需要改成字体子集内嵌方案，工作量较大，尚未评估。
- 本轮新增了 `MAINTENANCE.md`（维护清单），供后续 Agent 会话按场景触发对照执行；`AGENTS.md`「开始工作前」清单已同步加入该文件的阅读要求。
