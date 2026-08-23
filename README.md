# what2eat

通用菜谱规划 Skill + 远程 MCP 服务 + Markdown 菜谱知识库。产品依据见 `PRD/`（当前定稿 V0.2）。

## 结构

```text
specs/        工具与数据契约（JSON Schema，实现与测试共用的单一事实源）
packages/
  recipe-domain/    菜谱解析、校验、版本状态机、索引、汇总与方案校验
  price-providers/  价格 provider（新发地/农业农村部/基准价）与缓存降级
mcp/server/   远程 MCP 服务（Streamable HTTP + Bearer 鉴权）
knowledge/    Markdown 知识库：recipes/（已发布）、drafts/（草稿）、ingredients/、prices/
tests/        契约测试、知识库校验、Agent 场景测试
cowork/       多 Agent 协作变更记录
```

## 快速开始

```bash
npm install

# 跑全部测试（45 个：契约/领域/服务/价格/场景）
npm test

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

## 六个公共 MCP 工具

`search_recipes` / `grep_recipe_docs` / `read_recipe` / `aggregate_shopping_list` / `validate_meal_plan` / `quote_ingredient_prices`

契约定义在 `specs/tools/`，输入输出均为结构化 JSON，失败返回统一错误契约（`specs/tools/error.schema.json`）。

## 维护者 CLI

```bash
npm run recipe -- validate                 # 校验知识库
npm run recipe -- create-draft <file.md>   # 从源文档创建下一版草稿
npm run recipe -- publish <recipe_id> <version>   # 发布（不可变，过敏原自动复核）
npm run recipe -- archive <recipe_id> --reason "原因"
npm run recipe -- rebuild-index
```

菜谱知识库规则：每版本一份 Markdown（`knowledge/recipes/<id>/vN.md`），已发布不可改，改内容出新版本；价格、别名、单位换算以 `knowledge/ingredients/ingredients.md` 为准。

## 环境变量

| 变量 | 说明 |
| --- | --- |
| `WHAT2EAT_MCP_TOKEN` | Bearer Token；未设置且非 DEV 模式时拒绝启动 |
| `WHAT2EAT_DEV=1` | 本地开发模式：免鉴权、仅绑定 127.0.0.1 |
| `PORT` | 监听端口（默认 3000） |
| `WHAT2EAT_KNOWLEDGE_DIR` | 覆盖知识库目录（测试用） |
| `WHAT2EAT_ROOT` | 覆盖仓库根定位（specs/ 查找） |
