# 修复严格构建并加强运行时健壮性

- Agent：root
- 时间：2026-08-24T08:13:00+08:00
- 状态：完成
- 任务：修复 TypeScript 严格构建错误，并加强领域换算、工具契约、HTTP 边界和维护者 CLI 的健壮性。

## 修改

- `package.json`：将构建改为逐 workspace 的无产物 typecheck，避免生成未跟踪的 `tsconfig.tsbuildinfo`；维护者 CLI 改由兼容启动器执行。
- `scripts/run-recipe.mjs`：Node 22.6+ 使用原生 TypeScript stripping，旧版本回退本地 `tsx`，规避当前 Node 26 环境中 `tsx` 初始化 `uv_os_get_passwd` 失败。
- `packages/recipe-domain/src/units.ts`：将换算结果改为可判别联合类型，成功结果保证数量和基准单位存在；拒绝负数、NaN 和 Infinity。
- `packages/recipe-domain/src/aggregate.ts`：移除非空断言，拒绝非法份数，并安全处理采购单位与库存换算。
- `packages/recipe-domain/src/schema.ts`：修复 Ajv 在 NodeNext/TypeScript 5.9 下的导入类型；schema 缺失时返回明确的 `DATA_INVALID` 错误。
- `packages/recipe-domain/src/validator.ts`、`packages/recipe-domain/src/index.ts`：导出明确的领域输入类型，供 MCP 层在契约校验后使用。
- `mcp/server/src/tools.ts`：工具输入在共享 JSON Schema 校验后转换为领域类型；六个工具的成功输出在返回前再次执行共享输出 schema 校验，阻止契约漂移。
- `mcp/server/src/http.ts`：修复 MCP SDK 1.30 严格类型兼容；非法 JSON 返回结构化参数错误；超大请求体不再强制重置连接；按错误码映射 HTTP 状态并保留错误详情；健康检查支持查询参数；异步关闭失败被安全记录。
- `mcp/server/src/price.ts`：只在存在时传递可选规格字段，符合 `exactOptionalPropertyTypes`。
- `tests/recipe-domain.test.ts`：增加非法份数和非有限换算数量回归测试。
- `tests/server.test.ts`：增加非法 JSON、1MB 请求上限和带查询参数健康检查测试。
- `README.md`：更新测试数量并补充严格构建命令。

## 决定

- 保留 `strict`、`noUncheckedIndexedAccess` 和 `exactOptionalPropertyTypes`，不通过放宽编译器选项掩盖类型问题。
- `specs/` 继续作为工具输入输出的单一事实源；MCP 对成功输出也执行运行时契约校验。
- MCP SDK 1.30 的 Node transport 与其 `Transport` 在严格可选属性规则下存在声明不兼容；仅在连接边界做带注释的类型适配，不修改 SDK 或关闭检查。
- 未创建 Git 提交，未推送远端。

## 验证

- `npm run build`：通过；三个 workspace 的严格 TypeScript 检查全部通过，且未生成构建缓存文件。
- `npm test`：通过；5 个测试文件、48/48 测试通过。
- `npm run recipe -- validate`：通过；16 道已发布菜谱校验通过。
- `git diff --check`：通过；无空白错误。

## 遗留

- `scripts/run-recipe.mjs` 的旧版 Node `tsx` 回退路径未在当前 Node 26 环境实测；当前原生执行路径已通过。
- 本轮不处理通用 Skill、`specs/behavior/` 或云端部署，它们仍属于后续产品 P0 工作。
