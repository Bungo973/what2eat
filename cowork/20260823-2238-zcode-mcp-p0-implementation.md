# MCP 工程 P0 实施（M1-M7）

- Agent：zcode
- 时间：2026-08-23T22:38:05+08:00
- 状态：完成
- 任务：按已批准计划实施 what2eat MCP 工程 P0：specs 契约、recipe-domain、种子知识库、远程 MCP 服务（六工具）、价格 provider 链、测试与文档。

## 修改

- `package.json`、`tsconfig.base.json`、`vitest.config.ts`、`.gitignore`：npm workspaces 根配置（packages/* + mcp/server），TS 严格模式，vitest 覆盖 tests/ 与 packages/。
- `specs/README.md`、`specs/tools/*.schema.json`（14 个）、`specs/knowledge/*.schema.json`（3 个）：六工具输入输出契约、统一错误契约（9 错误码）、菜谱 frontmatter / 食材目录 / 基准价契约。MCP 实现与契约测试共用，单一事实源。
- `packages/recipe-domain/`：frontmatter 解析、schema 校验、版本状态机（最高非草稿版本为当前态、发布不可变、归档快照）、受控路径解析（防穿越）、内存结构化索引、受限正文搜索（子串+章节行号）、份数换算、采购汇总（别名/单位/扣库存/类目分组）、方案校验（餐次完整性/版本/过敏原目录复核/忌口/饮食方式/厨具/时长/硬预算）、发布 CLI（validate/create-draft/publish/archive/rebuild-index）。
- `packages/price-providers/`：PriceProvider 接口；XinfadiProvider（POST form、最新日期客户端过滤、preferred_specs 规格选择、斤单位、8s 超时）；PfscProvider（结论文本正则解析、±5% 区间、全国参考口径）；BenchmarkProvider（knowledge/prices 文档）；PriceCache（分类目 TTL：生鲜 24h/水产水果 48h/常温 72h）；QuoteService 降级链（城市实时→缓存→基准价→unknown，PROVIDER_DEGRADED 警告、时效超龄降可信度、量纲不符不伪造总价）。
- `mcp/server/`：Streamable HTTP 无状态模式 + Bearer 鉴权（timing-safe 比较、token 缺失拒绝启动、DEV 模式仅回环免鉴权）；令牌桶限流（全局 60/min、价格工具单独 12/min）；JSON 行日志（请求 ID/耗时/错误码，不记凭证）；六工具注册，输入按 specs ajv 强制校验，ToolError → 统一错误契约；/health 无鉴权探活。
- `knowledge/`：食材目录 43 项（别名/类目/采购单位/换算/过敏原标签/分源 price_query_terms）；16 道种子菜谱（早/午/晚/加餐、快慢烹饪、荤素、egg/milk/soy/wheat/peanut/fish/sesame 过敏原覆盖）经 CLI 正式发布；北京基准价文档（新发地 8/23 + 农业农村部 8/21 实测锚点 × 分类零售系数，口径披露）。
- `tests/`：tool-contracts（schema 自检）、recipe-domain（17）、server（8，真实 MCP 协议）、price-providers（10，fixture 回放不打真网）、agent-scenarios（3 场景）+ `smoke-live-prices.ts`（真实源冒烟脚本）。
- `README.md`：结构说明、快速开始、CLI 用法、环境变量。

## 决定

- 技术栈 TypeScript + @modelcontextprotocol/sdk（用户拍板）；P0 价格接真实源（用户拍板）；种子菜谱由 Agent 起草（用户拍板）。
- MCP 传输用 Streamable HTTP 无状态模式（每请求独立 transport），云端部署无需粘性会话。
- SDK 层 zod shape 仅做宽松类型检查，严格契约由 specs ajv 强制，保证单一事实源不被复制漂移。
- 硬预算校验设计为组合式：validate_meal_plan 接受 `pricing.total_range`（由 quote_ingredient_prices 产出）执行比较，MCP 内不生成宽泛方案。
- pfsc 全国价区间按均价 ±5% 构造并披露口径（结论文本只给均价）；置信度 low。
- 基准价口径 retail_estimate（批发锚点×分类系数），实时新发地报价明确标注批发价口径。
- 不创建 git 提交、不推送（遵守 AGENTS.md，待用户指示）。

## 验证

- `npx vitest run`：通过，5 个文件 45 个测试（契约 7、领域 17、服务 8、价格 10、场景 3）。
- `npm run recipe -- validate`：通过，16 道已发布菜谱；发布过程中过敏原自动复核生效（如拍黄瓜自动补 soy/wheat/sesame）。
- `npx tsx tests/agent-scenarios/smoke-live-prices.ts`：通过，三个 provider 对真实接口返回当日数据（新发地 8/23 番茄 0.8-2.2 元/斤等）。
- 服务启动冒烟（WHAT2EAT_DEV=1 PORT=3100）：通过，/health 200、MCP initialize 握手成功、JSON 日志含 request_id、16 菜谱加载。
- PRD 验收场景覆盖（工具层）：1 最少追问（Skill 层，待 Skill 轮）、2 追溯 ✓、3 过滤+正文搜索 ✓、4 完整读取 ✓、5 硬约束 ✓、6 采购汇总 ✓、7 价格披露 ✓、8 局部修改 ✓、9 价格失败降级 ✓、10 无解两轮（Skill 层）、11 版本不可变 ✓。

## 遗留

- Skill 主体（PRD §7）与 specs/behavior/ 行为规范：下一轮交付，随后可做端到端真实对话验证（含场景 1/10 的 Agent 行为）。
- 云端部署未做：部署时需设置 WHAT2EAT_MCP_TOKEN；若部署环境强制 HTTPS 出口，新发地 HTTP 接口需加代理转发。
- 鸡蛋等品种多规格并存时区间偏宽（散装/筐装混报）：后续可在目录 preferred_specs 细化（如 ["净","箱"]）。
- 基准价为一次性初版：建议每 1-2 周用实时数据复核；可把 pfsc 校准脚本化。
- 价格缓存为内存态：单实例重启即冷启动；多实例部署时需外置缓存（P0 范围外）。
- 江南市场（广州）provider 接口已验证但未实现（P1 城市扩展候选）。
