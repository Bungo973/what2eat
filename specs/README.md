# specs/ — 单一事实源

本目录存放平台无关的行为、数据与工具契约。Skill、MCP 实现与契约测试共同消费这些事实源，禁止在适配层或实现中复制后任其漂移。

## behavior/

- `meal-planning.md`：需求提取、约束优先级、工具编排、局部修改、降级和停止条件。
- `user-output.md`：候选、餐单、采购、价格、局部修改和失败的用户输出契约。

发布 Skill 前运行 `npm run skill:build`，将上述事实源机械同步到 `skills/meal-planning/references/`。生成副本用于 Skill 自包含分发，不作为新的维护入口；`npm run skill:check` 会阻止副本漂移。

## tools/

八个公共 MCP 工具的输入/输出 schema。文件命名 `kebab-case`，MCP 工具名为 `snake_case`：

| schema 文件前缀 | MCP 工具名 |
| --- | --- |
| `search-recipes` | `search_recipes` |
| `grep-recipe-docs` | `grep_recipe_docs` |
| `read-recipe` | `read_recipe` |
| `aggregate-shopping-list` | `aggregate_shopping_list` |
| `validate-meal-plan` | `validate_meal_plan` |
| `quote-ingredient-prices` | `quote_ingredient_prices` |
| `find-replacements` | `find_replacements` |
| `render-meal-plan-html` | `render_meal_plan_html` |

- `common.schema.json` 定义共享类型（区间、警告、分页等），各 schema 以相对 `$ref` 引用。
- `error.schema.json` 定义统一错误对象与错误码枚举，所有工具失败响应必须符合它。

## knowledge/

- `recipe-frontmatter.schema.json`：菜谱文档 YAML frontmatter 契约（PRD §9.2/9.3）。
- `ingredient-catalog.schema.json`：标准食材目录契约（PRD §9.4）。
- `benchmark-prices.schema.json`：地区基准价格文档契约（PRD §10）。
- `substitution.schema.json`：带上下文的食材替换/省略规则契约。
- `recipe-relation.schema.json`：菜谱替代、搭配、变体与余料关系契约。
- `obsidian-knowledge-base-sketch.md`：Obsidian 知识库设计草图、实体关系和试点迁移方法。

## 约束

- schema 只做结构性校验；跨字段规则（版本状态机、发布不可变、过敏原复核）在 `packages/recipe-domain` 校验器中以代码实现，并以本目录 schema 为结构底线。
- 对外契约的破坏性变更必须升 `schema_version` 并记录迁移说明（AGENTS.md 约定）。
