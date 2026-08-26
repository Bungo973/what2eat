# relations/substitutions 简化为 dish_role + 份量按角色缩放 + 版本小改机制

- Agent：claude-code
- 时间：2026-08-26T06:05:00+08:00
- 状态：完成
- 任务：按用户与 Agent 讨论确定的设计（详见对话），去掉 `knowledge/menu/relations/`，用菜谱级 `dish_role` 标签（`protein`/`vegetable`/`soup`/`staple`/`cold_dish`）实时检索替代人工两两声明的搭配/整菜替代关系；`substitutions/` 简化为只保留真正换食材（`mode: replace`）的规则，省略类折进已有的 `ingredients[].optional`/`notes`；购物清单按份数缩放时对 `seasoning`/`garnish`/`cooking_medium` 角色食材打五折（`1 + (rawScale-1)*0.5`），其余线性；新增 `reviseInPlace`/`revise --minor-edit`，给发布不可变规则开一个窄口子（只对当前生效版本、不升版本、无视源文件里的身份字段、拒绝改名）。

## 修改

### schema（`specs/`）
- `specs/knowledge/recipe-frontmatter.schema.json`：加可选 `dish_role` 枚举字段。
- `specs/tools/search-recipes.input.schema.json`/`.output.schema.json`：输入加 `dish_role` 过滤，输出 `items[]` 透出 `dish_role`。
- `specs/tools/read-recipe.output.schema.json`：`parsed` 透出 `dish_role`。
- 删除 `specs/knowledge/recipe-relation.schema.json`。
- `specs/knowledge/substitution.schema.json`：未改 schema 本身（`mode` 枚举仍含 `omit`），只是约定上以后只新建 `replace` 类，软约束不是硬拒绝。
- `specs/README.md`：同步说明。

### `packages/recipe-domain/src/`
- `types.ts`：加 `DishRole` 类型 + `RecipeMeta.dish_role?`；删除 `RecipeRelation` 接口。
- `schema.ts`/`index.ts`：去掉 `recipe-relation.schema.json` 注册和 `validateRecipeRelation` 导出。
- `repo.ts`：删除 `relationsRoot`/`relationsCache`/`loadRecipeRelations()`/`listPublishedRecipeRelations()`。
- `units.ts`：新增 `dampedScale(role, rawScale)` 五折缩放 helper，并从 `index.ts` 导出。
- `search.ts`：`SearchParams`/`SearchItem` 加 `dish_role`；`passesHardFilters` 加过滤；`read()` 用 `dampedScale` 缩放并透出 `dish_role`；实现同分候选组（`score`+`total_minutes` 完全相同）内的确定性可复现洗牌——种子编码进 `cursor`（无 cursor 时生成新种子，翻页复用同一种子，避免跨页重复/丢失），`RecipeSearchService` 新增可注入的 `rng` 构造参数供测试使用。
- `aggregate.ts`：份量缩放接入 `dampedScale`。
- `replacement.ts`：删掉读取 `relations/` 的 `explicit` 候选逻辑；`search.search(...)` 改按 `base.meta.dish_role` 过滤，`recipe_alternatives` 全部是 `relation_type: "derived"`；`base.meta.dish_role` 缺失时推 `NO_DISH_ROLE_ON_BASE` 警告；`NO_CURATED_REPLACEMENT` 触发条件简化为 `substitutions.length === 0`；`defines_dish`/`DISH_DEFINING_INGREDIENT_UNAVAILABLE` 逻辑未改动。
- `publish.ts`：`validateKnowledge()` 删掉扫描 `relations/` 的交叉校验；新增 `reviseInPlace()`（只允许改当前生效版本、强制沿用身份字段、拒绝改名、复用 `reviewAgainstCatalog` 校验深度）。
- `cli/index.ts`：新增 `revise <recipe_id> <version> <source.md> --minor-edit` 子命令。

### MCP 工具契约
- `mcp/server/src/tools.ts`：`search_recipes` 的 Zod schema 加 `dish_role`。

### 测试
- `tests/tool-contracts/schemas.test.ts`：schema 文件清单从 23 降到 22；新增 `dish_role` 接受/拒绝用例；关系文档往返测试删除，替换文档往返测试改成 `mode: replace` 示例。
- `tests/recipe-domain.test.ts`：fixture 新增 `dish_role` 标注（`dish-def-test`/`pork-stew`）及 3 个专用 fixture 菜谱（`steamed-egg-test` 同分候选组成员、`scale-test` 缩放测试、`revise-target-test` 原地小改测试，均与既有 fixture 隔离避免污染其他用例期望值）；新增 `dish_role` 过滤、同分组洗牌（确定性+翻页一致性+统计变化）、按角色缩放、`find_replacements` 的 dish_role 整菜候选与 `NO_DISH_ROLE_ON_BASE`、`reviseInPlace` 全部用例。
- `tests/agent-scenarios/scenarios.test.ts`：场景 3 断言从"返回 `tomato-eggs-scallion-omit` 替换规则"改为"`substitutions` 为空 + `NO_CURATED_REPLACEMENT` + 整菜候选来自同 `dish_role` 的 `derived` 检索"。

### 行为文档 + Skill 同步
- `specs/behavior/meal-planning.md`：`find_replacements` 路由说明改为 dish_role 检索表述；§4.2 补份量按角色缩放的说明。
- `specs/behavior/user-output.md`：§"换菜与替换"改写，去掉 `variant_of`/`alternative_to` 优先级措辞，加 `NO_DISH_ROLE_ON_BASE` 呈现规则。
- 已跑 `npm run skill:build` 同步进 `skills/meal-planning/references/{meal-planning,user-output}.md`。`local-mcp.md`/`pi-mcp.md` 确认为纯连接适配文档，未改。

### 知识库数据迁移
- `scripts/migrate-dish-role.ts`（临时脚本，跑完已删除，不进入提交）：给 22 篇已发布菜谱按映射表补 `dish_role`，产物已落盘。其中 4 篇菜谱（胡萝卜炒鸡蛋、青椒肉丝、麻婆豆腐、番茄炒蛋）的 `dish_role` 归类涉及内容判断（蛋类/豆腐类主料但无肉的菜暂定归 `protein`），见对话记录，非阻塞性、可随时调整。
- 手动补 3 处 `notes`（`tomato-eggs.scallion`、`smashed-cucumber.dried_chili`）承接原 `substitutions/` 文件里的步骤指导，避免删文件后信息丢失；`oat-milk-porridge.sugar` 原有 `notes` 已足够未改。
- 手动在 4 篇菜谱的"替换建议"正文追加一句原关系文件承载、`dish_role` 匹配不出来的具体提醒（燕麦牛奶粥↔葱香鸡蛋软饼的蛋奶过敏原提醒；香菇蒸鸡↔清蒸鲈鱼的用时/采购/报价提醒，双向都补）。
- 删除 6 个 `knowledge/menu/relations/*.md` 和 3 个 `knowledge/menu/substitutions/*.md`。

### PRD
- 新增 `PRD/AI原生菜谱Agent-PRD-V0.6.md`（状态：已实施），记录相对 V0.5 的变更：`dish_role` 取代 `relations/`（并说明这取代了 V0.5"设计方向 4"）、`substitutions/` 收窄为仅 `replace`、份量按角色缩放、`reviseInPlace` 版本例外、`search_recipes` 洗牌；对 V0.5 遗留的设计方向 2/3 明确维持搁置，方向 4 明确不再推进。未修改 V0.5 及更早版本文件。

### Vault 与根目录文档
- `knowledge/menu/AGENTS.md`、`knowledge/menu/维护说明.md`：去掉 `relations/` 相关指引，修正"只有 2 篇菜谱标注"的过期说法（实际 22 篇全有），补 `dish_role` 说明和 `revise --minor-edit` 例外条款。
- `knowledge/menu/templates/recipe-template.md`：加 `dish_role` 示例字段，修正 `defines_dish` 注释里对 `relations/` 的过期引用。
- `knowledge/menu/首页.md`：删掉指向已删除关系/替换文件的死链接和 `relations/` 条目说明。
- 根目录 `AGENTS.md`（"已发布版本不可原地覆盖"规则加 `reviseInPlace` 例外说明）、`MAINTENANCE.md`（维护场景表格行改写、"设计方向 2"段落按新基线重写）、`README.md`（结构说明去掉 `relations/`）。

## 决定

- `substitution.schema.json` 的 `mode` 枚举保留 `omit`，不做 schema 硬性收窄——软约束（只是约定不再新建）风险更低，且不是破坏性变更。
- `reviseInPlace` 只允许操作**当前生效版本**，旧版本/归档版本仍然真正不可变；这是发布不可变规则的窄口子，不是取消该规则——已确认这不会破坏"生成方案必须携带实际读取 recipe_id+version"的可追溯性要求（生成的 HTML/购物清单本身是内容快照，不是需要事后解引用的版本指针）。
- 同分候选组洗牌的随机种子编码进分页 `cursor`，而不是每次调用都用全新随机数——避免翻页时同一逻辑查询的候选跨页重复或丢失。
- 4 篇 `dish_role` 归类有争议的菜谱（胡萝卜炒鸡蛋、青椒肉丝、麻婆豆腐、番茄炒蛋；蛋类/豆腐类主料但无肉或只有少量肉）暂定归 `protein`，作为内容判断留给用户复核，不是本次代码改动的一部分。

## 验证

- `npm test`：通过（86/86，6 个测试文件）。
- `npm run typecheck --workspaces --if-present`：通过（修了 `publish.ts` 一处 `exactOptionalPropertyTypes` 类型错误）。
- `npm run recipe -- validate`：校验通过，22 道已发布菜谱。
- `npm run skill:build && npm run skill:check`：Skill 引用已同步。

## 追加（同一轮工作内）

用户当场反馈五类 `dish_role` 不够用，追加两类并重新分类 3 篇菜谱：

- schema/类型/MCP 契约（`recipe-frontmatter.schema.json`、`search-recipes.input/output.schema.json`、`read-recipe.output.schema.json`、`types.ts` 的 `DishRole`、`mcp/server/src/tools.ts` 的 Zod enum）都加了 `mixed`（荤素难分）和 `other`（不属于任何一类）两个值。
- `scripts/reclassify-mixed.ts`（临时脚本，跑完已删除，不进入提交）：用刚做好的 `reviseInPlace` 把番茄炒蛋、麻婆豆腐、胡萝卜炒鸡蛋从 `protein` 改成 `mixed`（原地修订，不升版本）；青椒肉丝有真实猪肉，维持 `protein` 不变。
- 改这批时发现一个真实行为：`tests/agent-scenarios/scenarios.test.ts` 场景 3 原本用"大葱"做缺货食材，但番茄炒蛋改归 `mixed` 后，同分类仅剩的两篇（麻婆豆腐、胡萝卜炒鸡蛋）恰好都含大葱这个点缀食材，导致整菜候选被清空——这是 `mixed` 样本小的真实局限，不是逻辑错误。改用"白糖"作为该用例的缺货食材（不与同分类候选冲突），保留原有断言意图。
- 同步更新了 `knowledge/menu/AGENTS.md`、`维护说明.md`、`templates/recipe-template.md` 和 `PRD/AI原生菜谱Agent-PRD-V0.6.md`（V0.6 是本轮新增的文档，在同一次工作内直接修订，不算回改历史版本）。

## 遗留

- 全仓库扫描确认唯一剩余的 `recipe-relation`/`relations/` 提及都在历史文档里（`PRD/AI原生菜谱Agent-PRD-V0.5.md` 与既有 `cowork/` 记录），按规则不应回改，未触碰。
- ~~按根目录 `AGENTS.md` 的 PRD 版本管理规则，这次改动理论上应该新建 PRD V0.6~~ 已补（见上）。
- `scripts/migrate-dish-role.ts`、`scripts/reclassify-mixed.ts` 是一次性迁移脚本，跑完已按用户要求删除，不进入本次提交；迁移逻辑和结果已经完整记录在本文件和 PRD V0.6 里，不影响可追溯性。
- 3 篇改归 `mixed` 的菜谱（胡萝卜炒鸡蛋、麻婆豆腐、番茄炒蛋）分类结论仍是内容判断，留给用户复核；青椒肉丝有真实猪肉，已确认维持 `protein`，不需要复核。
