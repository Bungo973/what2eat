# PRD V0.5：食材关系模型设计方向（未实施，评审用）

- Agent：root
- 时间：2026-08-24T22:10:00+08:00
- 状态：完成（本轮仅产出设计文档，不涉及代码/schema/知识库实施）
- 任务：用户反馈 `relations/`（菜谱关系）承担不了"食材缺货/不想要某食材时快速梳理受影响菜谱与候选"这类需求，经过一轮讨论（先梳理用户会怎么问、再结合专业厨师视角设计数据结构）后，把设计方向落成 PRD V0.5，同时明确"先不着急改代码"。

## 修改

- `PRD/AI原生菜谱Agent-PRD-V0.5.md`：新增。文档信息标注状态为"设计方向，未实施——需评审通过后再排入实施计划"，V0.4 已实施范围不受影响。核心内容：
  - 背景：用户实际提问梳理成四类（食材→菜谱发现、缺食材→计划影响面、单菜单食材可省可换、换后下游重算），逐类标注现状能力覆盖到哪、缺口在哪。
  - 设计方向 1：`recipe.ingredients[]` 新增 `role`/`optional`/`defines_dish`。
  - 设计方向 2：替换规则放开"通用角色规则"判断（`packages/recipe-domain/src/replacement.ts` 现有的保守拦截逻辑），但要求按精确规则/通用规则分置信度披露。
  - 设计方向 3：食材目录新增可选 `functional_groups`，明确定位为"弱信号候选"，不得自动升级为可执行规则。
  - 设计方向 4：`recipe-relation.schema.json` 新增可选 `balance_dimensions`（口味浓淡/烹饪方式/颜色/耗时）和 `distinguishing_ingredient_ids`，把 relations 的"为什么搭"从自由文本变成结构化维度，但明确不承担完整食材图职责。
  - 非目标、风险、分阶段落地建议（先角色字段，再通用规则，功能分组和关系结构化维度可延后独立评审）均已写明。
- `specs/knowledge/obsidian-knowledge-base-sketch.md`：文首新增一段引用说明，指出 PRD V0.5 认领了该文档第 3、5 节的食材角色设计方向，并列出 V0.5 新增的三个该文档未覆盖的概念（`defines_dish`、功能分组、`balance_dimensions`），避免两份文档后续各自演化产生歧义。

## 决定

- **没有回改或覆盖 `PRD/AI原生菜谱Agent-PRD-V0.4.md`**，按 AGENTS.md 历史版本只读的规则，新方向整份放进 V0.5。
- V0.5 明确标注"设计方向，未实施"，不是"可实施"状态，因为用户本轮明确要求"先不着急改"；这份 PRD 的作用是把讨论过程中达成的设计共识固化下来，供后续评审和实施引用，不代表已经决定马上做。
- V0.5 内容诚实标注了和 `PRD/AI原生菜谱Agent-PRD-V0.3.md` §9.2–9.4 的关系——现在的设计方向大部分是恢复并细化 V0.3 已经设计但没有进入 V0.4 实施范围的食材角色模型（`role`/`optional`/`valid_context.roles` 早就在 V0.3 和 `substitution.schema.json` 里出现过），本轮真正新增的是 `defines_dish`、食材功能分组、`balance_dimensions` 三个概念，PRD 里也这样如实标注了，不冒充全新设计。
- 通用替换规则、食材功能分组两块，PRD 里都显式写了"必须分置信度/需人工确认后才可用作候选"的安全阀，呼应 AGENTS.md"对无法证明的通用规则采取保守拒绝"的既有原则，避免设计方向本身埋下"语义相似度绕过硬过滤"的隐患。

## 验证

- 本轮无代码/schema/知识库改动，`npm test`/`npm run recipe -- validate`/`npm run build` 均无需重新运行（上一轮改动已验证通过，本轮未触碰任何实现文件）。
- PowerShell 逐字节校验 `PRD/AI原生菜谱Agent-PRD-V0.5.md` 和更新后的 `specs/knowledge/obsidian-knowledge-base-sketch.md`：null/控制字符计数均为 0。

## 遗留

- 本设计方向尚未评审、未排期，`role`/`optional`/`defines_dish`/`functional_groups`/`balance_dimensions` 均未写入任何 schema，`packages/recipe-domain/src/replacement.ts` 的判断逻辑也未改动，16 篇已发布菜谱的食材角色未回填。
- 用户下一步想聊"知识库后续维护成本"，属于本记录任务范围之外的独立话题，未在本记录中处理。
