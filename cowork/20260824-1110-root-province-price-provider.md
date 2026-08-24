# 省级物价查询与预算语义优化

- Agent：root
- 时间：2026-08-24T11:10:32+08:00
- 状态：完成
- 任务：增强物价查询工具，使其至少能够明确查询并返回省级市场价格；扩大参考价覆盖，同时避免把全国价或跨地区参考价误导为当地价格或已验证预算。

## 修改

- `packages/price-providers/src/pfsc-market.ts`：新增全国农产品批发市场价格信息系统的省级市场报价适配器，支持省级市场聚合、单项失败隔离、并发限制、全国降级和结构化来源元数据。
- `packages/price-providers/src/regions.ts`：新增省级行政区静态表和城市/区县到省份的确定性解析。
- `packages/price-providers/src/quote.ts`：将逐项调用改为批量分层查询，补充省级、全国和跨地区参考价覆盖统计及预算状态。
- `packages/price-providers/src/cache.ts`：缓存键纳入地区和渠道，本地严格查询不复用降级结果。
- `packages/price-providers/src/benchmark.ts`：增加显式标注为北京跨地区参考价的最终降级能力。
- `packages/price-providers/src/pfsc.ts`、`packages/price-providers/src/xinfadi.ts`、`packages/price-providers/src/types.ts`、`packages/price-providers/src/index.ts`：统一地区范围、价格口径、降级状态、预算可用性和市场数量等元数据。
- `knowledge/ingredients/ingredients.md`：将食材目录升级到 v2，为 20 种可可靠对应的食材补充 PFSC 品种 ID；没有可靠对应关系的食材不做猜测映射。
- `specs/knowledge/ingredient-catalog.schema.json`、`packages/recipe-domain/src/types.ts`：允许食材价格查询词携带可审计的外部品种 ID。
- `mcp/server/src/price.ts`、`mcp/server/src/tools.ts`：接入省级价格适配器与分层降级链，新增 `allow_national_fallback` 参数。
- `specs/tools/quote-ingredient-prices.input.schema.json`、`specs/tools/quote-ingredient-prices.output.schema.json`：扩展工具输入输出契约，明确请求地区、命中地区、范围、降级、价格口径、覆盖统计和 `budget_status`。
- `specs/tools/validate-meal-plan.input.schema.json`、`packages/recipe-domain/src/validator.ts`：硬预算只有在价格完整且 `budget_status=verified` 时才能通过；批发价、全国价和跨地区参考价不能冒充硬预算验证。
- `skills/meal-planning/SKILL.md`、`specs/behavior/meal-planning.md`、`specs/behavior/user-output.md`：要求 Agent 展示价格覆盖和命中地域，区分省级价、全国降级及跨地区参考，并在预算不可验证时使用“参考估算”表述。
- `skills/meal-planning/references/`：通过 Skill 构建同步生成的行为规范副本，避免宿主相对路径读取失败。
- `tests/price-providers.test.ts`、`tests/tool-contracts/schemas.test.ts`、`tests/recipe-domain.test.ts`、`tests/agent-scenarios/scenarios.test.ts`、`tests/agent-scenarios/smoke-live-prices.ts`：新增省级解析、降级策略、缓存隔离、契约、预算语义和真实数据源冒烟测试。
- `README.md`：更新价格数据源、地区语义、预算限制和测试数量说明。

## 决定

- 优先返回请求省份内的市场报价；只有显式允许时才使用全国或跨地区参考价，并在每一项报价中保留请求地区和实际命中地区。
- 省内市场少于 4 个时使用观测最小值和最大值；市场较多时使用四分位区间，降低异常市场报价对参考区间的影响。
- 官方批发市场报价与维护的零售基准都属于参考价，不能验证用户的硬预算；价格未知也不以 0 代替。
- 对没有省级数据的包装商品和细分肉类，使用北京维护基准扩大参考覆盖，但明确标为 `cross_region`、低置信度和 `reference_only`。
- PFSC 省级图表接口来自其公开网页前端，当前没有公开稳定 API/SLA，因此将解密和接口细节隔离在单独 provider 中，并保留其他数据源降级。

## 验证

- `npm run skill:build`：通过；自包含 Skill 及引用文件生成成功。
- `npm test`：通过；6 个测试文件、63 个测试全部通过。
- `npm run build`：通过；Skill 校验及所有 workspace TypeScript 类型检查通过。
- `npm run recipe -- validate`：通过；16 个已发布菜谱校验成功。
- `npx vite-node tests/agent-scenarios/smoke-live-prices.ts`：通过；上海番茄、土豆、黄瓜命中上海省级市场数据，鸡蛋可明确降级到全国数据。
- 17 项上海采购清单端到端实测：17 项均得到参考价格；7 项为上海省级、4 项为全国降级、6 项为北京跨地区基准，参考总价 75.80–97.74 元，`budget_status=reference_only`、`complete=false`，未误判为硬预算已验证。

## 遗留

- PFSC 网页前端接口没有公开稳定性承诺，若页面接口或传输格式变化，省级 provider 可能暂时降级到其他价格源。
- 当前只为 20 种具有可靠对应关系的食材配置 PFSC 品种 ID；后续可继续人工审核扩充，不能用模糊名称自动猜测外部 ID。
- 北京跨地区基准只能提供粗略零售参考，不能代表上海或其他省份的实际零售价。
- MCP 服务实现与工具 schema 已改变，部署或本地测试前需要重启 MCP；宿主如缓存 Skill，也应重新加载 Skill 或开启新会话。
