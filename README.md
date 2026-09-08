# what2eat

通用菜谱规划 Skill + MCP 服务 + Obsidian/Markdown 菜谱知识库。产品依据见 `PRD/`（当前可实施版本 V0.4）；当前开发运行方式为本地 MCP，Skill 的产品行为不依赖部署位置。

## 结构

```text
skills/
  meal-planning/    通用 Skill 与本地 MCP 运行说明
skill-prod/
  meal-planning/    可独立分发的正式版 Skill，与本仓库解耦；不随 specs/behavior/*.md 自动同步，发布新版本时手动更新
specs/
  behavior/         平台无关行为与用户输出契约
  tools/            工具输入输出 JSON Schema
  knowledge/        菜谱、食材和基准价格 schema
packages/
  recipe-domain/    菜谱解析、校验、版本状态机、检索、汇总、替换与 HTML 渲染
  price-providers/  价格 provider（新发地/PFSC 省级市场聚合/全国日报/基准价）与缓存降级
mcp/server/   远程 MCP 服务（Streamable HTTP + Bearer 鉴权）
knowledge/menu/ Obsidian Vault：recipes/、drafts/、ingredients/、substitutions/、prices/
tests/        契约、知识库、Skill 与 Agent 场景测试
cowork/       多 Agent 协作变更记录
MAINTENANCE.md  维护清单：哪些信息需要用户提供、哪些常规维护场景 AI 可自主处理
```

## 快速开始

```bash
npm install

# 跑全部测试（契约/领域/服务/价格/Skill/场景）
npm test

# 严格 TypeScript 构建检查（不会生成构建缓存文件）
npm run build

# 更新/检查可独立分发的 Skill references
npm run skill:build
npm run skill:check

# 本地启动 MCP 服务（无鉴权，仅回环地址）—— bash / Git Bash
WHAT2EAT_DEV=1 npm start

# 同上 —— PowerShell（环境变量语法不同）
$env:WHAT2EAT_DEV = "1"; npm start

# 正式启动（Bearer 鉴权）—— bash / Git Bash
WHAT2EAT_MCP_TOKEN=<token> PORT=3000 npm start
# 正式启动 —— PowerShell
$env:WHAT2EAT_MCP_TOKEN = "<token>"; $env:PORT = "3000"; npm start

# MCP 端点: http://localhost:3000/mcp  （Authorization: Bearer <token>）
```

## 八个公共 MCP 工具

`search_recipes` / `grep_recipe_docs` / `read_recipe` / `aggregate_shopping_list` / `validate_meal_plan` / `quote_ingredient_prices` / `find_replacements` / `render_meal_plan_html`

契约定义在 `specs/tools/`，输入输出均为结构化 JSON，失败返回统一错误契约（`specs/tools/error.schema.json`）。

`quote_ingredient_prices` 的 `region` 可省略，缺省为全国参考；给出省市时会优先聚合同省多个 PFSC 批发市场报价。省级缺价时可回退全国，最后再使用明确标记的跨地区维护者基准价。可通过 `allow_national_fallback: false` 禁止全部跨地区回退。每条报价明确返回实际地区、地区层级、市场数、价格口径和预算可用性。

`find_replacements` 读取 Vault 中已发布的上下文替换规则，整菜候选按菜谱的 `dish_role` 分类实时检索得出（不再依赖人工声明的菜谱关系）；`render_meal_plan_html` 把已经确定的菜单、菜谱、采购和价格渲染成自包含 HTML，不参与规划或计算。

## 维护者 CLI

```bash
npm run recipe -- validate                 # 校验知识库
npm run recipe -- create-draft <file.md>   # 从源文档创建下一版草稿
npm run recipe -- publish <recipe_id> <version>   # 发布（不可变，过敏原自动复核）
npm run recipe -- revise <recipe_id> <version> <source.md> --minor-edit   # 原地小改当前生效版本，不升版本
npm run recipe -- archive <recipe_id> --reason "原因"
npm run recipe -- rebuild-index
```

菜谱知识库规则：每版本一份 Markdown（`knowledge/menu/recipes/<id>/<菜名>-vN.md`，文件夹名是稳定的 `recipe_id`，文件名前缀是发布时刻的中文菜名），已发布不可改，改内容出新版本；价格查询词、别名、单位换算以 `knowledge/menu/ingredients/ingredients.md` 为准。Obsidian 双链用于人工浏览，MCP 关系以 frontmatter 的稳定 ID 为准。

## 环境变量

| 变量 | 说明 |
| --- | --- |
| `WHAT2EAT_MCP_TOKEN` | Bearer Token；未设置且非 DEV 模式时拒绝启动 |
| `WHAT2EAT_DEV=1` | 本地开发模式：免鉴权、仅绑定 127.0.0.1 |
| `PORT` | 监听端口（默认 3000） |
| `WHAT2EAT_KNOWLEDGE_DIR` | 覆盖知识库目录（测试用） |
| `WHAT2EAT_ROOT` | 覆盖仓库根定位（specs/ 查找） |
| `WHAT2EAT_ARTIFACT_DIR` | 覆盖 HTML 产物输出目录（默认写入系统临时目录） |
