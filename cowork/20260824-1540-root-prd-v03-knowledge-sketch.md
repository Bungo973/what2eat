# PRD V0.3 与 Obsidian 知识库设计草图

- Agent：root
- 时间：2026-08-24T15:40:43+08:00
- 状态：完成
- 任务：创建新的 PRD，明确 HTML 餐单、可选预算和关系型知识库方向，并提供面向初次设计知识库的 Obsidian 草图。

## 修改

- `PRD/AI原生菜谱Agent-PRD-V0.3.md`：新增 V0.3 草案，定义 `MealPlanArtifact`、自包含 HTML 产物、预算三态、Obsidian 维护边界、关系型知识模型、动态换菜流程、分阶段范围和验收标准。
- `specs/knowledge/obsidian-knowledge-base-sketch.md`：新增通俗设计草图，说明实体、关系、目录结构、菜谱食材角色、替换规则、Obsidian Properties/Links/Bases 用法、超预算和缺货流程，以及 3 道菜谱试点方法。
- `specs/README.md`：登记知识库设计草图，明确它目前是设计说明而非已发布 schema。

## 决定

- V0.3 状态为“草案，可用于 HTML 原型与知识库 schema 试点”；V0.2 继续作为稳定 P0 基线，全量迁移前需要评审试点结果。
- HTML 不直接成为事实源；餐单、菜谱、采购、价格和校验先形成统一 `MealPlanArtifact`，再确定性渲染 Markdown 或 HTML。
- 预算采用 `off | reference | hard` 三态。未要求价格或预算时不询问地区、不报价、不展示空预算区块。
- Obsidian 用于维护和浏览，Markdown、schema、版本规则和 CLI 校验继续控制发布质量；不把社区插件设为运行时依赖。
- 只人工维护 `variant_of`、`alternative_to`、`pairs_with`、`uses_leftover_from` 等具有明确产品语义的关系；共享食材、文本相似和本次价格差异由索引计算。
- 食材替换必须记录角色、技法/菜谱上下文、比例、步骤变化和风险；动态价格只负责给可行候选排序，不能写成静态“永远更便宜”。
- 先迁移番茄炒蛋、麻婆豆腐、香菇蒸鸡做 schema 和 Obsidian 维护体验试点，不直接修改现有 16 道正式菜谱。

## 验证

- Markdown 围栏检查：通过；两份新文档的顶层代码块和 Mermaid 围栏成对。
- `git diff --check`：通过；仅有现有 Windows LF/CRLF 提示，无空白错误。
- `git diff --exit-code -- PRD/AI原生菜谱Agent-PRD-V0.2.md`：通过；历史 PRD V0.2 未修改。
- `npm run build`：通过；Skill 引用同步和所有 workspace TypeScript 类型检查通过。

## 遗留

- V0.3 仍是设计草案，尚未创建 `MealPlanArtifact`、菜谱 schema v2、单食材 schema、替换规则 schema 或 HTML renderer。
- Obsidian `.base` 文件和模板需在 schema 试点确定后创建，避免把尚未稳定的字段提前固化。
- 候选公共工具 `render_meal_plan_html` 与 `find_replacements` 尚未发布；需要先完成共享契约和兼容性评审。
