# 物价与预算表格化输出

- Agent：root
- 时间：2026-08-24T13:49:33+08:00
- 状态：完成
- 任务：将 Meal Planning Skill 的物价与预算输出固定为便于核对的 Markdown 表格。

## 修改

- `specs/behavior/user-output.md`：要求价格请求先输出预算摘要表，再输出覆盖全部待采购食材的逐项估价表；明确表头、缺价项表达、报价地区、价格口径、时间和可信度的展示规则。
- `skills/meal-planning/references/user-output.md`：通过 Skill 构建同步平台无关输出契约，确保安装后的 Skill 自包含最新规则。
- `tests/skill.test.ts`：增加表格结构和缺价项保留规则的契约测试。
- `README.md`：将全量测试数量更新为 64。

## 决定

- 预算摘要与逐项价格分别使用表格：摘要突出总价、覆盖率和预算结论，明细保留每项价格的可追溯依据。
- 无法估价的待采购食材也必须进入逐项表，以“—”显示单价和小计，并说明缺价原因，避免表格只呈现成功项而造成覆盖率误解。
- 采购量与单价计价单位分列呈现；全国回退和跨地区参考仍需明确标注，表格化不改变预算验证语义。

## 验证

- `npm run skill:build`：通过；Skill 引用同步完成。
- `npm test -- --run tests/skill.test.ts`：通过；6/6。
- `npm test`：通过；6 个测试文件、64/64。
- `npm run build`：通过；Skill 同步检查与所有 workspace TypeScript 类型检查通过。
- `quick_validate.py skills/meal-planning`：未能运行；系统 Python 启动器不可用，工作区 Python 又缺少脚本所需的 `PyYAML`。现有 frontmatter、引用自包含和同步状态已由 `tests/skill.test.ts` 与 `npm run skill:check` 验证。

## 遗留

- 无功能遗留。宿主如果缓存 Skill，需要重新加载 Skill 或开启新会话才能稳定应用新的表格输出规则；本次没有修改 MCP 工具实现或 schema。
