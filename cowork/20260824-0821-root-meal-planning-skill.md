# 构建通用菜谱规划 Skill（本地 MCP 阶段）

- Agent：root
- 时间：2026-08-24T08:21:09+08:00
- 状态：完成
- 任务：按 PRD V0.2 构建通用 `meal-planning` Skill；当前运行阶段通过宿主已连接的本地 what2eat MCP 调用六个公共工具。

## 修改

- `skills/meal-planning/SKILL.md`：新增轻量 Skill 入口，定义触发范围、最少追问、硬约束、工具路由、两轮修正停止条件、局部换菜和工具不可用边界。
- `skills/meal-planning/references/local-mcp.md`：新增本地运行配置说明；默认端点为 `http://127.0.0.1:3000/mcp`，普通菜谱任务不擅自启动服务、不接触真实 Token。
- `specs/behavior/meal-planning.md`：新增平台无关行为事实源，覆盖任务状态、阻塞信息、约束优先级、六工具编排、周期规划、局部修改、降级和不变量。
- `specs/behavior/user-output.md`：新增候选、完整菜谱、周期餐单、采购、价格、局部修改和失败输出契约。
- `tests/skill.test.ts`：新增 Skill frontmatter、引用完整性与六工具声明的持久化结构测试。
- `specs/README.md`：登记行为规范目录，并明确 Skill、MCP 和测试共同消费单一事实源。
- `README.md`：登记 Skill/behavior 目录、当前本地 MCP 运行方式和 51 个测试。

## 决定

- 使用 `skill-creator` 的轻入口与渐进式披露原则；平台无关规则放在 `specs/behavior/`，本地运行细节单独放在 Skill reference。
- 不新增 `agents/openai.yaml` 或 Codex 专属 MCP 配置，避免把宿主包装变成产品规则的唯一来源；Skill 假设宿主已连接工具。
- 用户未要求价格时不询问地区、不调用价格工具；周期餐单必须确认范围、餐次、份数和过敏/严格限制。
- 形成或修改餐单后必须校验；自动修正最多两轮，仍无解时停止且不得静默放宽硬约束。
- 本轮不创建提交、不推送。

## 验证

- `npx vitest run tests/skill.test.ts tests/agent-scenarios/scenarios.test.ts`：通过，6/6；覆盖单次查询、五天周期规划、局部换菜以及 Skill 结构不变量，Agent 场景通过本地 MCP SDK 链路执行。
- `npm test`：通过，6 个测试文件、51/51。
- `npm run build`：通过，三个 workspace 严格 TypeScript 检查通过。
- `npm run recipe -- validate`：通过，16 道已发布菜谱校验通过。
- `rg -n "TODO|TBD|FIXME|placeholder|占位" skills specs/behavior tests/skill.test.ts`：通过，无未完成脚手架标记。
- `git diff --check`：通过，无空白错误。
- `skill-creator/scripts/quick_validate.py skills/meal-planning`：未能运行；系统 Python 是不可访问的 WindowsApps 占位程序，工作区 Python 可运行但缺少 PyYAML（`ModuleNotFoundError: yaml`）。未将其记录为通过；frontmatter、名称和引用路径由 `tests/skill.test.ts` 等价覆盖。

## 遗留

- 等用户进行真实对话测试后，再根据实际触发、追问和表达偏差做窄幅迭代。
- 尚未进行独立模型 forward evaluation；当前验证覆盖结构与真实 MCP 工具链，不等价于宿主模型行为评测。
- MCP 仍为本地运行，远程部署和宿主专用连接配置留待后续。
