# specs/ — 单一事实源

本目录存放平台无关的数据契约与工具契约。MCP 实现与契约测试共用这些 JSON Schema，禁止在实现中复制后任其漂移。

## tools/

六个公共 MCP 工具的输入/输出 schema。文件命名 `kebab-case`，MCP 工具名为 `snake_case`：

| schema 文件前缀 | MCP 工具名 |
| --- | --- |
| `search-recipes` | `search_recipes` |
| `grep-recipe-docs` | `grep_recipe_docs` |
| `read-recipe` | `read_recipe` |
| `aggregate-shopping-list` | `aggregate_shopping_list` |
| `validate-meal-plan` | `validate_meal_plan` |
| `quote-ingredient-prices` | `quote_ingredient_prices` |

- `common.schema.json` 定义共享类型（区间、警告、分页等），各 schema 以相对 `$ref` 引用。
- `error.schema.json` 定义统一错误对象与错误码枚举，所有工具失败响应必须符合它。

## knowledge/

- `recipe-frontmatter.schema.json`：菜谱文档 YAML frontmatter 契约（PRD §9.2/9.3）。
- `ingredient-catalog.schema.json`：标准食材目录契约（PRD §9.4）。
- `benchmark-prices.schema.json`：地区基准价格文档契约（PRD §10）。

## 约束

- schema 只做结构性校验；跨字段规则（版本状态机、发布不可变、过敏原复核）在 `packages/recipe-domain` 校验器中以代码实现，并以本目录 schema 为结构底线。
- 对外契约的破坏性变更必须升 `schema_version` 并记录迁移说明（AGENTS.md 约定）。
