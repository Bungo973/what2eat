# 建立多 Agent 协作规范并评审 PRD

- Agent：agent-001（首个 Agent）
- 时间：2026-08-23T20:39:17+08:00
- 状态：完成
- 任务：阅读 AI 原生菜谱 Agent PRD，建立后续 Agent 的仓库级协作规范，并评估 Skill + MCP 方案可行性。

## 修改

- `AGENTS.md`：新增仓库级 Agent 规范，定义项目边界、共享工作区协作方式、`cowork` 留痕要求、Skill/MCP 设计约束、测试要求和完成标准。
- `cowork/20260823-2039-agent-001-project-bootstrap.md`：记录本次修改、判断依据和交接事项。

## 决定

- 使用 Codex 自动发现的标准文件名 `AGENTS.md`，而不是不保证自动加载的 `agent.md`。
- `cowork` 采用“一次连续任务一份、默认只新增不改旧记录”的日志方式，以降低多 Agent 同时追加同一文件时的冲突。
- 平台无关行为规范和共享 schema 应成为单一事实源，Skill 与 MCP 分别消费，避免两套规则漂移。
- 暂不选择 TypeScript/Python、鉴权方式、菜谱文件格式或价格数据源；这些会显著影响架构，应在 P0 开工前形成明确决策。

## 验证

- `Get-Content -Raw AGENTS.md`：通过，文件内容和 Markdown 结构完整。
- `Get-Content -Raw cowork/20260823-2039-agent-001-project-bootstrap.md`：通过，记录字段完整且与本次修改一致。
- 文档任务，无代码测试。

## 遗留

- 需要确认首个发布载体是仅支持 Codex 本地安装，还是按可发布 Plugin（Skill + MCP）建设。
- 需要确定 P0 技术栈、远程鉴权、菜谱源格式、首发地区、种子菜谱规模及 JSON/Markdown 双输出策略。
- PRD 可行性结论与建议在本次对话交接中给出，尚未改写 PRD。
