# 修复价格覆盖判断与餐单输出一致性

- Agent：root
- 时间：2026-08-24T09:44:07+08:00
- 状态：完成
- 任务：根据上海两日餐单实测，简化首次接触，修复报价数量单位歧义、硬预算误判和正式餐单中的不一致内容。

## 修改

- `skills/meal-planning/SKILL.md`：首次空白进入只问“想怎么安排吃的？”；所有阻塞信息先问后调用；禁止默认无忌口、部分价格宣称预算通过，以及未追溯的“配米饭”等正式餐单项。
- `specs/behavior/meal-planning.md`：强化阻塞信息检查、报价覆盖摘要、采购数量/单价单位分离、硬预算未验证语义和正式餐单追溯规则。
- `specs/behavior/user-output.md`：简化首次接触；规范窄屏餐单布局、Markdown 表头和列表；定义价格覆盖优先表达、预算矛盾禁令与大量缺口的压缩表达。
- `skills/meal-planning/references/meal-planning.md`、`skills/meal-planning/references/user-output.md`：由共享行为事实源重新生成，保持 Skill 自包含。
- `packages/price-providers/src/quote.ts`：每条报价新增 `requested_quantity`，不再让采购数量与单价单位混用；新增服务端确定性的请求数、报价数、可计算总价数、请求地区覆盖数、完整性和已估价小计；传播 provider 限制与跨地区回退警告。
- `specs/tools/quote-ingredient-prices.output.schema.json`：以向后兼容的可选字段登记 `requested_quantity` 和 `summary` 契约。
- `packages/recipe-domain/src/validator.ts`：硬预算在价格缺失或 `complete !== true` 时返回 `BUDGET_UNVERIFIED`，不再只写 assumption 后让 errors 为空。
- `specs/tools/validate-meal-plan.input.schema.json`：新增可选 `pricing.complete`；缺省按价格不完整处理。
- `specs/tools/validate-meal-plan.output.schema.json`：新增 `BUDGET_UNVERIFIED` 错误码。
- `mcp/server/src/tools.ts`：MCP 输入 schema 接受 `pricing.complete`；价格工具描述明确数量单位分离和请求地区覆盖摘要。
- `tests/price-providers.test.ts`：覆盖 0.7 斤鸡蛋按公斤计价但不误写数量、全国参考不算上海本地覆盖，以及完整覆盖摘要。
- `tests/recipe-domain.test.ts`：覆盖硬预算完整报价、部分报价和无报价三种确定性结果。
- `tests/agent-scenarios/scenarios.test.ts`：周期规划报价场景验证请求数量和服务端覆盖摘要。
- `README.md`：完整测试数量更新为 55。

## 决定

- 价格工具的第一优先级是正确披露覆盖与单位，不用伪造的城市价格换取表面上的完整预算。
- `summary.complete` 仅在全部请求项都有可换算总价且全部匹配请求地区时为真。全国参考价可以形成“已估价小计”，但不能验证上海硬预算。
- 硬预算属于硬约束；没有完整价格时必须成为 `BUDGET_UNVERIFIED` 错误，方案只能称为“预算待核候选”。
- 报价输出只做向后兼容的字段新增；旧字段保留，新的 Skill 优先消费 `requested_quantity` 和 `summary`。
- 当前价格事实源仍主要是北京基准价和少量全国批发品种。本轮不把北京价格伪装为上海零售价；提高上海覆盖率需要后续接入可审计的上海 provider 或新增有来源的上海基准数据。
- 本轮修改 MCP 服务端代码，因此部署到本地运行实例后需要重启 MCP；Skill 仍需完整复制并重新加载 Pi。
- 本轮不创建提交、不推送。

## 验证

- `npm run skill:build`：通过，共享规范已同步到 Skill references。
- `npm run skill:check`：通过，生成副本与事实源一致。
- 相关 Vitest 六文件：通过，55/55。
- `npm test`：通过，6 个测试文件、55/55。
- `npm run build`：通过，Skill 检查和三个 workspace TypeScript 检查通过。
- `npm run recipe -- validate`：通过，16 道已发布菜谱。
- `rg` 未完成标记扫描：通过，无匹配。
- `git diff --check`：通过，仅有工作区行尾提示，无空白错误。
- `skill-creator/scripts/quick_validate.py skills/meal-planning`：未能运行；Codex 工作区 Python 缺少 PyYAML（`ModuleNotFoundError: yaml`）。未记录为通过；frontmatter、包内引用、契约与场景行为由 Vitest 覆盖。

## 遗留

- 上海价格覆盖率仍有限；后续若要验证上海硬预算，需要选择并接入可审计的上海本地零售/菜场价格源，或维护带来源和日期的上海基准价格文档。
- 用户需重启本地 MCP，并重新复制完整 `skills/meal-planning/` 后重启 Pi 或新建会话复测。
