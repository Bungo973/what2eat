# Pi MCP 工具名适配

本文件只适用于 Pi Agent 通过其 MCP 桥接器连接 what2eat 的情况，不改变平台无关的菜谱规划和数据规则。

## 精确工具名

Pi 可能把 MCP 服务名加到工具名前。先对 `what2eat` 服务执行工具列表查询，并把规范名绑定到列表实际返回的唯一名称。当前常见映射是：

| 规范工具名 | Pi 列表中的工具名 |
| --- | --- |
| `search_recipes` | `what2eat_search_recipes` |
| `grep_recipe_docs` | `what2eat_grep_recipe_docs` |
| `read_recipe` | `what2eat_read_recipe` |
| `aggregate_shopping_list` | `what2eat_aggregate_shopping_list` |
| `validate_meal_plan` | `what2eat_validate_meal_plan` |
| `quote_ingredient_prices` | `what2eat_quote_ingredient_prices` |
| `find_replacements` | `what2eat_find_replacements` |
| `render_meal_plan_html` | `what2eat_render_meal_plan_html` |

- 工具列表是当前会话的事实源；服务别名变化时前缀也可能变化，不要脱离列表硬拼名称。
- 描述工具和调用工具时都传入列表中的完整名称。例如列表返回 `what2eat_search_recipes` 后，不要再请求 `search_recipes`。
- 当前任务中复用同一映射。若同一规范名匹配多个候选，停止调用并报告歧义，不猜测。
- `tool_not_found` 且错误建议中给出唯一的命名空间版本时，改用建议的完整名称重试一次；不要在裸名和前缀名之间反复试探。

## Pi 中的一次性成稿

缺少过敏/严格忌口等真正阻塞的信息时只提出问题并停止；缺少地区不阻塞默认全国参考报价。用户补齐信息后，直接执行剩余工具链，不输出“收到”“我来查询”或逐步重试说明；完成餐单、采购、报价、校验和 HTML 渲染后再发送一条最终回复。Pi 仍可能显示宿主自己的 MCP 工具卡片，这不属于 Skill 可以隐藏的文本输出。
