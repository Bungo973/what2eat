# MCP 启动日志增加可读横幅

- Agent：zcode
- 时间：2026-08-23T22:46:00+08:00
- 状态：完成
- 任务：用户要求增加一条醒目的"mcp 已启动"日志。原 `server_started` 为 JSON 行日志，不够直观且未含端点地址。

## 修改

- `mcp/server/src/index.ts`：`server.listen` 回调中，结构化日志 `server_started` 增加 `endpoint` 字段；另输出一条人类可读启动横幅（端点 URL、鉴权模式、已发布菜谱数），方便控制台直接确认。

## 决定

- 横幅用 `process.stdout.write` 输出纯文本（与 JSON 行日志并存）：结构化日志供采集，横幅供人看。

## 验证

- `WHAT2EAT_DEV=1 PORT=3101 npx tsx mcp/server/src/index.ts` 启动冒烟：通过；横幅输出 `what2eat MCP 已启动: http://127.0.0.1:3101/mcp`，JSON 日志含 `endpoint` 字段，`/health` 返回 200。
- 服务测试不受影响（`tests/server.test.ts` 不经过该入口文件）。

## 遗留

- 无。
