# Obsidian 迁移、默认报价与 HTML 产物

- Agent：root
- 时间：2026-08-24T16:18:54+08:00
- 状态：完成
- 任务：把现有知识内容迁入用户创建的 `knowledge/menu` Obsidian Vault，完整结果默认报价，并调整 MCP 与 meal-planning Skill；同时实现关系检索和 HTML 计划页。

## 修改

- `PRD/AI原生菜谱Agent-PRD-V0.4.md`：新增可实施版本，定义默认参考报价、全国缺省地区、Obsidian 根目录、八工具契约和 HTML 默认产物；历史 PRD 未覆盖。
- `knowledge/menu/`：将原 `recipes/`、`drafts/`、`ingredients/`、`prices/` 迁入 Vault，保留用户 `.obsidian` 配置；用 `首页.md` 和 `维护说明.md` 替换 Obsidian 默认欢迎页。
- `knowledge/menu/substitutions/`：新增 3 条由现有菜谱正文直接佐证的已发布省略规则。
- `knowledge/menu/relations/`：新增 6 条整菜替代或搭配关系；关系不固化动态价格结论。
- `specs/knowledge/*.schema.json`、`specs/tools/find-replacements.*.schema.json`、`specs/tools/render-meal-plan-html.*.schema.json`：新增替换、关系、替换查询和 HTML 渲染契约；共享食材引用允许标准 ID 或可解析名称。
- `packages/recipe-domain/src/{paths,repo,publish,schema,types,replacement,html,index}.ts`：默认知识根切换到 Vault，加载/校验关系知识，实现保守替换候选和安全自包含 HTML 渲染。
- `mcp/server/src/{tools,price,html}.ts`：注册 `find_replacements`、`render_meal_plan_html`；报价地区改为可选并缺省“全国”；HTML 产物以内容哈希命名并写入可配置目录。
- `skills/meal-planning/`、`specs/behavior/`：按 skill-creator 规范更新 Skill。完整菜谱/正式餐单默认采购、报价与 HTML；地区缺失不阻塞，用户可明确拒绝报价；Pi 映射扩展到八个工具。
- `README.md`、`specs/README.md`：同步 V0.4、Vault 路径、八工具和新环境变量说明。
- `tests/`：增加无地区报价归一化、中文食材别名、替换关系、HTML 安全与 MCP 端到端覆盖，并同步八工具断言。

## 决定

- 已发布菜谱不因 Obsidian 迁移升版；目录迁移与内容版本是两件事。
- “默认报价”只针对已选定的完整菜谱或正式餐单；仅浏览候选、无待购项、用户明确拒绝或价格工具不可用时可省略。
- 未给地区时使用全国参考，不为报价单独追问；未给预算时不产生硬预算约束。
- Obsidian 双向链接服务于人工浏览，MCP 以 frontmatter 稳定 ID 为机器事实源。
- 替换关系只给候选。预算换菜后必须重新读取、汇总、报价、校验，避免把静态关系误读成实时低价。
- 对无法由结构化数据证明的通用角色/技法替换规则采取保守拒绝；当前发布规则均绑定具体菜谱。

## 验证

- `npm test`：通过，6 个测试文件、71 项测试全部通过。
- `npm run build`：通过；Skill 引用同步，三个 workspace TypeScript 检查通过。
- `npm run recipe -- validate`：通过；16 道已发布菜谱以及新增替换/关系引用校验通过。
- `npm run skill:build` / `npm run skill:check`：通过；平台无关规范已同步到 Skill 包。

## 遗留

- 当前关系知识是第一批示范数据；后续需按维护流程逐步补充更多食材替换、余料复用和菜谱变体，不能一次性用未经审核的 AI 批量发布。
- MCP 公共工具列表、默认知识根和 Skill 行为均已变化，正在运行的本地 MCP 与 Agent 会话需要重启/重新加载后才能使用新能力。
- `knowledge/.obsidian/` 与 `knowledge/menu/.obsidian/` 同时存在；本次仅把用户指定的 `knowledge/menu` 作为 MCP Vault，未删除另一套用户 Obsidian 配置。
