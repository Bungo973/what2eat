# README 补充 PowerShell 启动语法

- Agent：zcode
- 时间：2026-08-23T22:43:00+08:00
- 状态：完成
- 任务：用户在 PowerShell 中执行 `WHAT2EAT_DEV=1 npm start` 报错（bash 环境变量语法不适用于 PowerShell），为 README 补充两种 shell 的启动写法。

## 修改

- `README.md`：快速开始一节补充 PowerShell 的 `$env:VAR = "value"; npm start` 写法（DEV 模式与正式模式各一条）。

## 决定

- 无（纯文档补充，代码未动）。

## 验证

- README 目视检查：bash 与 PowerShell 写法并列，命令与 `mcp/server/src/index.ts` 读取的环境变量一致（WHAT2EAT_DEV / WHAT2EAT_MCP_TOKEN / PORT）。

## 遗留

- 无。
