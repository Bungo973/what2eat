# 16 道菜谱就地补齐食材角色标注（v1 原地覆盖，版本号不递增）

- Agent：root
- 时间：2026-08-25T21:45:00+08:00
- 状态：完成
- 任务：把知识库全部 16 道菜谱的 `ingredients[]` 补齐 `role`/`optional`/`defines_dish`（PRD V0.5 设计方向 1）。按用户明确要求，**不新建 v2，直接就地改写 v1 文件**，使知识库每道菜只保留唯一一个 v1 版本。

## 修改

- `knowledge/menu/recipes/*/<菜名>-v1.md`（16 个）：就地补齐共 92 条食材的 `role`/`optional`/`defines_dish`；`published_at` 由 2026-08-23 改为 2026-08-25。除下述两道外正文未改。
- `knowledge/menu/recipes/tomato-eggs/番茄炒蛋-v2.md`、`knowledge/menu/recipes/smashed-cucumber/拍黄瓜-v2.md`：删除。这两道菜此前（20260825-1311 记录）已发布带标注的 v2；本次按"每道菜只保留一个 v1"的要求，把 v2 内容下沉回 v1 后删除 v2 文件。
- `knowledge/menu/recipes/steamed-chicken-shiitake/香菇蒸鸡-v1.md`：按用户要求主料由 `chicken_breast`（鸡胸肉）换为 `chicken_thigh`（去骨鸡腿肉）并锁定 `defines_dish: true`；同步改「做法」第 1 步、重写「替换建议」（原"鸡腿肉更嫩"一句已失效）、「储存与安全」补带骨鸡腿需加蒸 5-8 分钟的提示（原 15 分钟按鸡胸计时）。
- `knowledge/menu/recipes/oat-milk-porridge/燕麦牛奶粥-v1.md`：按用户要求锁定 `milk`（`defines_dish: true`）；「替换建议」中"乳糖不耐可换温水或植物奶"删除并改写为香蕉/白糖的可省说明，乳糖不耐降级为「储存与安全」的注意事项并指向葱香鸡蛋软饼。
- `knowledge/menu/ingredients/ingredients.md`：新增 `chicken_thigh` 条目（鸡腿肉；别名 鸡腿/去骨鸡腿肉/琵琶腿；category meat；新发地查询词 鸡腿）。不补则发布/校验会因"食材不在目录中"失败。

## 决定

- **本次绕过了 `AGENTS.md`「已发布版本不可原地覆盖」和 `knowledge/menu/AGENTS.md` 核心规则 1，是用户明确、反复确认的一次性要求**（原话："把之前的 v1 全部以 v2 的格式覆盖掉""名字都换成 v1"）。因此未走 `create-draft`→`publish` 流程——`publishDraft()` 会因目标文件已存在而抛 `conflict`，且拒绝发布不高于当前版本的版本号，本次改动只能通过直接改写文件完成。**这不应作为惯例；后续对这些菜谱的内容修改仍应新建 v2。**
- 中途曾按标准流程发布过 14 个 v2 版本并删除全部 v1，随后依用户澄清全部回退：v2 文件重命名回 `-v1.md` 且 frontmatter `version` 改回 1（`repo.scan()` 会校验两者一致）。**相应地，一度改指 v2 的 `knowledge/menu/relations/*.md`（6 个）、`knowledge/menu/substitutions/*.md`（3 个）引用与 `tests/agent-scenarios/scenarios.test.ts` 中 5 处硬编码版本号，均已改回 v1，与 HEAD 一致，净改动为零。**
- `defines_dish` 判定规则：仅当该食材是菜品身份来源、且菜谱正文「替换建议」未给出可保持同菜身份的替换方案时标 `true`。据此白灼菜心（可换芥蓝/油菜）、清蒸鲈鱼（可换鳊鱼/鳜鱼）主料标 `false`，标 `true` 会屏蔽菜谱自带的替换建议。逐条经用户确认。
- 香菇蒸鸡的鸡腿肉、燕麦牛奶粥的牛奶由用户指定锁定，覆盖上述规则。
- 调味料一律用 `optional: false` 表达"不能省"，不用 `defines_dish: true`——后者会连带屏蔽同类替换（如香醋换白醋），语义过宽。
- `盐` 统一 `optional: true`，与既有标注保持一致。
- **未给 `chicken_thigh` 补基准价。** `prices/beijing-benchmark.md` 每条价格都有可追溯的批发锚点推导，手头无鸡腿肉真实锚点，按 `AGENTS.md`"价格未知时返回未知，不以零代替"留空。

## 验证

- `npm run recipe -- validate`：通过（`校验通过：16 道已发布菜谱`）。
- `npm run typecheck`：通过。
- `npm test`：76/76 通过。
- `npm run skill:check`：`Skill 引用已同步`。
- 端到端：用真实知识库直接调 `findReplacements` 核对锁定行为——燕麦牛奶粥缺牛奶、香菇蒸鸡缺鸡腿肉均返回 0 条同菜候选 + `DISH_DEFINING_INGREDIENT_UNAVAILABLE`（前者正确回退到葱香鸡蛋软饼）；白灼菜心缺菜心无该警告。
- `git diff` 复核：16 个 v1 文件均为纯新增字段的就地修改，无正文意外改动（香菇蒸鸡、燕麦牛奶粥的正文改动为用户指定）。

## 遗留

- **`chicken_thigh` 缺基准价**，香菇蒸鸡采购报价会出现未知项。需用户提供鸡腿肉零售价区间，或下次核价时补 `prices/beijing-benchmark.md`。
- **"可以换"目前只存在于菜谱正文，没有结构化 `substitutions/` 规则**：白灼菜心→芥蓝/油菜、清蒸鲈鱼→鳊鱼/鳜鱼等，`findReplacements` 的同菜候选仍为 0 条，锁定与否的实际差别目前只有那条警告。若要工具真正推荐这些替换，需起草替换规则（口味判断，需用户确认后发布），且芥蓝/油菜/鳊鱼/鳜鱼尚未进食材目录。
- **版本历史已被压平**：这 16 道菜不再保留任何历史版本，`番茄炒蛋`/`拍黄瓜` 的 v1→v2 演进记录也已消失（仅存在于 git 历史与 20260825-1311 记录中）。
- 16 道菜现已全部标注，PRD V0.5「设计方向 2」（通用角色规则 + 置信度分层）的"样本太少"前提已不成立，可按 `MAINTENANCE.md` 触发条件重新评估。
- `MAINTENANCE.md` 未覆盖"批量升级已发布菜谱数据结构"场景，且其"不直接改旧版本（已发布不可变）"的表述与本次实际操作冲突，后续如再遇同类需求应先与用户确认口径。
