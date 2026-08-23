# 明确通用 Skill、PRD 版本与 Git 交付规则

- Agent：agent-001（首个 Agent）
- 时间：2026-08-23T20:52:48+08:00
- 状态：完成
- 任务：根据用户澄清，修正 Skill 定位、PRD 迭代方式和 GitHub 交付目标。

## 修改

- `AGENTS.md`：明确 Skill 面向通用 Agent 宿主，MCP 与菜谱知识库是工程重点；新增 PRD 只新增版本、不覆盖历史稿的规则；登记 GitHub 目标仓库与安全提交/推送约束。
- `cowork/20260823-2052-agent-001-clarify-scope-versioning-git.md`：记录本轮修改和当前 Git 状态。

## 决定

- 不再将 Codex Skill 视为产品唯一或主要封装；平台无关规范是核心规则的单一事实源，宿主包装只负责适配。
- PRD 每次迭代创建更高版本文件，历史版本默认只读保留。
- 将 `https://github.com/Bungo973/what2eat` 登记为预期 GitHub 远端；本轮不配置远端、不提交、不推送。

## 验证

- `git status --short --branch`：通过；Git 已初始化，当前为无提交的 `master` 分支，现有文件均未跟踪。
- `git remote -v`：通过；当前未配置远端。
- `Get-Content -Raw AGENTS.md` 与关键规则检索：通过；通用 Skill、MCP/知识库重点、PRD 版本化和 Git 交付规则均已写入。

## 遗留

- GitHub 目标地址未能通过公开页面验证，可能是私有或尚未创建的仓库；首次推送前需要确认访问权限与默认分支。
- 尚未配置 `origin`、创建初始提交或推送；等待用户明确要求。
