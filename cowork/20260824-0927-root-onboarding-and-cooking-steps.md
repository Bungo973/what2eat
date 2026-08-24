# 优化首次接触与可执行烹饪步骤

- Agent：root
- 时间：2026-08-24T09:27:01+08:00
- 状态：完成
- 任务：根据 Pi 首次进入截图和真实输出反馈，减少生硬的工具/字段说明，并确保最终餐单包含可直接照做的食材与步骤。

## 修改

- `skills/meal-planning/SKILL.md`：首次无具体需求时禁止探测 MCP、罗列工具和字段；增加自然简短的首次引导；要求最终入选菜谱读取完整正文，并默认输出目标份数食材和做法。
- `specs/behavior/meal-planning.md`：把首次接触的零工具调用、自然引导和具体任务直达规则写入平台无关事实源；强化周期规划及局部换菜对完整正文的读取要求。
- `specs/behavior/user-output.md`：增加首次接触示例；定义可执行烹饪卡、去重规则和“餐单 → 做法 → 采购 → 预算 → 警告”的最终输出顺序。
- `skills/meal-planning/references/meal-planning.md`、`skills/meal-planning/references/user-output.md`：由构建脚本同步共享行为规范，供 Pi 自包含分发。
- `tests/agent-scenarios/scenarios.test.ts`：周期餐单逐道读取目标份数食材和正文做法；局部换菜验证替换菜谱也能返回完整做法。

## 决定

- 仅打开或调用 Skill 不构成可执行任务，因此不应先查询 MCP 工具列表；这也避免 Pi 首屏出现无意义的 MCP 卡片。
- 最终选定餐单默认是“可直接执行”的产物。除非用户明确只要菜名或简表，每道不同菜必须包含目标份数食材和基于知识库正文的做法。
- 长周期餐单可压缩选择理由，并让重复菜谱共用一张烹饪卡，但不得为了缩短回复而完全省略做法。
- 做法可以忠实压缩，但必须保留关键顺序、火候、时间、温度、熟度和安全信息；不得依据模型常识补写知识库没有的细节。
- 本轮仅修改 Skill、行为规范和场景测试，不修改 MCP 服务端；不创建提交、不推送。

## 验证

- `npm run skill:build`：通过，共享规范已同步到 Skill references。
- `npm run skill:check`：通过，生成副本与事实源一致。
- `npx vitest run tests/skill.test.ts tests/agent-scenarios/scenarios.test.ts`：通过，8/8。
- `npm test`：通过，6 个测试文件、54/54。
- `npm run build`：通过，Skill 检查及三个 workspace TypeScript 检查通过。
- `npm run recipe -- validate`：通过，16 道已发布菜谱。
- `rg` 未完成标记扫描：通过，无匹配。
- `git diff --check`：通过，仅有工作区行尾提示，无空白错误。
- `skill-creator/scripts/quick_validate.py skills/meal-planning`：未能运行；Codex 工作区 Python 缺少 PyYAML（`ModuleNotFoundError: yaml`）。未记录为通过；frontmatter、包内引用和场景行为由 Vitest 覆盖。

## 遗留

- 需要重新复制完整 `skills/meal-planning/` 到 Pi 并重启 Pi 或新建会话后做一次真实交互复测。MCP 服务端本轮无需重启。
