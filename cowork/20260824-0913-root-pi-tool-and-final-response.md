# 修复 Pi 工具映射、报价输入与一次性回复

- Agent：root
- 时间：2026-08-24T09:13:59+08:00
- 状态：完成
- 任务：根据 Pi Agent 截图中的真实失败，修复工具找不到、报价输入不稳定和逐步播报问题，并确认是否需要重启 MCP。

## 修改

- `skills/meal-planning/SKILL.md`：要求先绑定宿主实际暴露的精确工具名；增加一次性成稿规则；明确报价输入从采购汇总的标准 ID、待购数量和单位派生。
- `skills/meal-planning/references/pi-mcp.md`：新增 Pi 专用适配，登记六个 `what2eat_*` 映射、唯一候选绑定和一次有限重试规则；不把宿主命名污染到平台无关契约。
- `specs/behavior/meal-planning.md`：增加平台无关的工具注册表映射规则、静默编排规则和采购到报价的确定性映射与缺口处理。
- `specs/behavior/user-output.md`：要求补齐阻塞信息后一次性交付餐单、采购和价格/预算；定义完整总价与“已估价小计”的边界。
- `skills/meal-planning/references/meal-planning.md`、`skills/meal-planning/references/user-output.md`：通过构建脚本同步上述共享行为规范，保持 Skill 分发包自包含。
- `tests/skill.test.ts`：校验 Pi 适配包含六个唯一的 namespaced 工具映射。
- `tests/agent-scenarios/scenarios.test.ts`：周期规划场景改为把 `ingredient_id`、`to_buy.quantity`、`to_buy.unit` 传入报价，并验证可汇总的 `total_price`。
- `README.md`：将完整测试数量更新为 54。

## 决定

- Pi 工具列表返回的名称是实际调用事实源；截图中应调用 `what2eat_search_recipes`、`what2eat_quote_ingredient_prices` 等完整名称，而不是裸规范名。
- MCP 服务端契约与实现本轮无需修改。优化后不需要重启正在运行的 MCP；需要重新复制完整 `skills/meal-planning/` 到 Pi，并重启 Pi 或新建会话，让宿主重新加载 Skill。
- 报价仅覆盖标准化且有正数待购量和单位的项目；未知项不按零元计入，避免伪造完整预算。
- Pi 自身显示的 MCP 工具卡片由宿主控制，Skill 只禁止额外的“我来查询/收到/重试”文本播报。
- 本轮不创建提交、不推送。

## 验证

- `npm run skill:build`：通过，平台无关规范已同步到 Skill references。
- `npm run skill:check`：通过，生成副本与事实源一致。
- `npx vitest run tests/skill.test.ts tests/agent-scenarios/scenarios.test.ts`：通过，8/8。
- `npm test`：通过，6 个测试文件、54/54。
- `npm run build`：通过，Skill 同步检查和三个 workspace TypeScript 检查均通过。
- `npm run recipe -- validate`：通过，16 道已发布菜谱。
- `rg` 未完成标记扫描：通过，无匹配。
- `git diff --check`：通过，仅有工作区行尾提示，无空白错误。
- `skill-creator/scripts/quick_validate.py skills/meal-planning`：未能运行；系统 Python 是不可访问的 WindowsApps 占位程序，Codex 工作区 Python 可运行但缺少 PyYAML（`ModuleNotFoundError: yaml`）。未记录为通过；frontmatter、引用自包含和 Pi 映射由 Vitest 覆盖。

## 遗留

- 需要用户在 Pi 中重新分发完整 Skill 并用真实会话复测。宿主若改用其他 MCP 服务别名，应以该会话工具列表为准，而不是硬编码 `what2eat_` 前缀。
