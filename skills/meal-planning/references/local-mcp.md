# 本地 MCP 运行说明

此文件只描述当前项目的本地运行配置，不改变菜谱规划行为。

## 运行边界

- Skill 假设宿主已经连接 what2eat MCP；普通菜谱请求不得擅自启动、重启或配置服务。
- 当前端点默认为 `http://127.0.0.1:3000/mcp`。
- 本地开发可使用仅绑定回环地址的无鉴权模式；Bearer Token 模式由宿主保存凭证，Skill 不读取、回显或记录 Token。
- 如果工具不可见、连接拒绝或健康检查失败，停止依赖该工具的步骤并告诉用户。不要用模型记忆替代知识库、价格或校验结果。

## 用户明确要求本地调试时

在仓库根目录启动：

```powershell
$env:WHAT2EAT_DEV = "1"; npm start
```

健康检查：`http://127.0.0.1:3000/health`。

正式本地 Token 模式：

```powershell
$env:WHAT2EAT_MCP_TOKEN = "<token>"; $env:PORT = "3000"; npm start
```

只说明示例值，不要求用户在对话中粘贴真实 Token。服务端应暴露八个工具：

`search_recipes`、`grep_recipe_docs`、`read_recipe`、`aggregate_shopping_list`、`validate_meal_plan`、`quote_ingredient_prices`、`find_replacements`、`render_meal_plan_html`。
