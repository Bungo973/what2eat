# AI 原生菜谱 Agent PRD V0.6

## 文档信息

- 版本：V0.6
- 日期：2026-08-26
- 状态：已实施——本版本记录的改动已落地并通过验证（`npm test`/`npm run typecheck`/`npm run recipe -- validate`/`npm run skill:check`），是当前运行基线
- 上一版本：V0.5

## 相对 V0.5 的变更

V0.5 的"设计方向 1"（食材 `role`/`optional`/`defines_dish`）在 V0.5 评审后已经落地，并在维护者实际使用 Obsidian 知识库、菜谱规模从 16 篇增长到 22 篇的过程中暴露出一个 V0.5 没有覆盖的问题：`relations/`（菜谱关系）是**人工两两声明**的模型，维护成本随菜谱数量增长是 O(n²) 的——22 篇菜谱只积累了 6 条关系，这次新增的 6 篇菜谱一条关系都没建，说明这套机制在规模变大后会持续失效，不是"还没来得及补"的问题，是设计本身撑不住。

V0.5 提出的"设计方向 4"（给 `recipe-relation.schema.json` 加结构化 `balance_dimensions`/`distinguishing_ingredient_ids`）本质上是在给这套人工关系模型做加法，不解决维护成本问题，反而会加重。V0.6 判断这个方向不值得继续投入，**改为直接去掉 `relations/` 整个机制**，用菜谱级的 `dish_role` 分类标签（`protein`/`vegetable`/`soup`/`staple`/`cold_dish`）替代——配餐和整菜替代都改成运行时按 `dish_role` 实时检索，不再需要维护者手动声明"这两道菜搭"。新菜谱只要打好 `dish_role` 标签就自动参与全部配餐/替代场景，不需要回头补关系。**V0.5 设计方向 4 因此被本版本取代，不再推进**（详见"对 V0.5 遗留设计方向的处置"）。

除此之外，本版本还顺带处理了三个在同一轮维护对话中发现的相关问题：`substitutions/` 里全部已发布规则其实都是"省略"类，和已有的 `ingredients[].optional`/`notes` 字段重复；购物清单按人数缩放时对调味料等食材做了不符合实际做菜经验的严格线性缩放；发布版本"不可原地修改"的规则对错字、用量这类小改造成了不必要的摩擦（维护者此前已经不得不做过一次绕开该规则的一次性例外操作）。这三点和 `dish_role` 改造在同一批实施，因为都属于"降低知识库长期维护成本"这同一个主题。

## 背景：这次维护暴露的具体问题

| 问题 | 现状 | 影响 |
| --- | --- | --- |
| `relations/` 是人工两两声明，维护成本 O(n²) | 22 篇菜谱只有 6 条关系，新增 6 篇一条没建 | 菜谱规模越大，"能查到搭配/替代"的覆盖率相对越低，不是越高 |
| `substitutions/` 里的省略类规则和 `ingredients[].optional` 语义重复 | 3 条已发布规则全是 `mode: omit`，对应食材本身也都已经标了 `optional: true` | 同一件事被两处结构化数据分别维护，容易漂移不一致 |
| 购物清单缩放对全部食材统一线性 | `scale = target_servings / recipe.servings` 直接乘在每个食材上 | 人数翻倍时调味料/油等用量也机械翻倍，不符合实际做菜经验 |
| 发布版本不可原地修改，覆盖错字/小调整这类场景 | 唯一路径是升版本，此前一次角色字段回填被迫作为显式记录在案的一次性例外绕开规则 | 小修改的仪式成本和大改一样，且例外操作缺少一个正式、可重复使用的机制 |

## 设计变更

### 1. `dish_role`：菜谱级角色标签替代人工声明的 `relations/`

`recipe-frontmatter.schema.json` 菜谱顶层新增可选字段：

```yaml
dish_role: protein   # protein | vegetable | soup | staple | cold_dish | mixed | other
```

实施后立刻发现最初五个分类不够用：蛋类、豆腐类主料但没肉或肉只是配料的菜（番茄炒蛋、麻婆豆腐、胡萝卜炒鸡蛋），在"算荤还是算素"上没有客观答案，硬塞进 `protein` 只是权宜之计。追加 `mixed`（荤素难分）和 `other`（确实不属于前几类）两个值，把这 3 篇通过新增的 `revise --minor-edit` 命令原地改成 `mixed`，不再勉强分类。

配餐（"几荤几素"）和整菜替代（`find_replacements` 的 `recipe_alternatives`）都通过 `search_recipes`/`find_replacements` 在查询时按 `dish_role` 实时过滤得出，不再依赖任何预先声明的关系文档。`recipe-relation.schema.json` 及 `knowledge/menu/relations/` 目录整体删除；`find_replacements` 的 `recipe_alternatives[].relation_type` 不再产出 `variant_of`/`alternative_to`，全部是 `derived`（`relation_type` 枚举本身保留 `variant_of`/`alternative_to` 取值以保持向后兼容，只是代码不再产出，属于非破坏性收窄）。

**用户体验影响**：呈现 `recipe_alternatives` 时不能再暗示"这几道菜经过人工审核确认搭配"，措辞必须体现"来自确定性分类检索"（已同步进 `specs/behavior/user-output.md`）。原来 6 条关系里有 2 条承载了 `dish_role` 匹配不出来的具体提醒（跨品类换菜时的过敏原/用时提醒），已作为人读提示手工搬进对应菜谱正文的"替换建议"，不再是结构化数据。

**已知代价**：`dish_role` 只能表达"类型上可以互换"，丢失了原关系模型能表达的"这两道菜具体为什么搭"这类细腻理由。这是有意识的取舍——用可扩展性换掉了人工审核的精确度，理由见"背景"一节。

### 2. `substitutions/` 收窄到只保留真正的换食材规则

`mode: omit`（单纯省略）不再单独建文件，改为直接使用菜谱自身 `ingredients[].optional: true` + `notes` 表达；`substitutions/` 只保留 `mode: replace`（换成另一种食材）的规则，因为这类规则携带的过敏原变化、口味变化不能从菜谱本身推导，仍然值得结构化 authoring。`substitution.schema.json` 未做破坏性收窄（`mode` 枚举仍含 `omit`），这是约定层面的收窄，不是 schema 硬拒绝，为将来万一需要保留余地。

迁移后 `substitutions/` 目录为空（此前 3 条规则全部是 `omit` 类），符合预期，不是遗漏。

### 3. 购物清单缩放按食材角色区分（复用已有的 `role` 字段）

`packages/recipe-domain/src/units.ts` 新增 `dampedScale(role, rawScale)`：`primary`/`supporting`（及未标注角色，向后兼容）保持线性缩放；`seasoning`/`garnish`/`cooking_medium` 按打五折的强度跟随人数变化（`1 + (rawScale - 1) * 0.5`），例如份数翻倍时这类食材只增加到 1.5 倍而不是 2 倍。接入 `read_recipe` 的 `scaled_ingredients` 和 `aggregate_shopping_list` 两处既有的缩放计算，不新增工具或字段。

### 4. 发布版本不可变规则新增窄口子：`reviseInPlace`

新增 CLI 子命令 `npm run recipe -- revise <recipe_id> <version> <source.md> --minor-edit`，只允许覆盖**当前生效版本**的内容：拒绝对旧版本或归档版本生效；无视源文件里的 `recipe_id`/`version`/`status`/`published_at`，强制沿用当前发布记录；拒绝改名（会改变文件名，不算"原地"）。校验深度与正常 `publish` 一致（schema 校验 + 目录复核 + 过敏原自动修正）。

这不是取消"已发布版本不可原地覆盖"这条规则，是给它开一个范围极窄、显式命令、无法误用为常规修改路径的例外，专门覆盖错字、用量微调、补角色标注这类不改变菜品身份的小改；内容实质变化仍然必须走 `create-draft` → `publish` 升版本。已确认此举不影响"最终方案必须携带工具实际读取到的 `recipe_id + version`"这条可追溯性不变量——生成的 HTML/采购清单落盘的是生成时刻读到的完整内容快照，不是需要事后解引用的版本指针。

### 5.（次要）`search_recipes` 同分候选组随机化

`search_recipes` 原有排序在候选完全同分时以 `recipe_id` 字典序决胜，导致同样的查询条件下总是推荐同一个候选——这会让 Agent 在多次调用间显得"总是那几个菜"。改为对 `(score, total_minutes)` 完全相同的候选组做随机洗牌，真实相关性排序（文本匹配分数、耗时）不受影响；随机种子编码进分页 `cursor`，同一次翻页内部结果一致、不重复不丢失，不同次全新查询才会换种子。这条与 `dish_role` 无直接关系，是同一轮维护里顺带发现并修的一个独立问题。

## 对 V0.5 遗留设计方向的处置

- **设计方向 1**（`role`/`optional`/`defines_dish`）：早已落地，全部 22 篇已发布菜谱均已标注，是本版本其余改动的基础，无需重新评审。
- **设计方向 2**（通用角色规则 + 置信度分层，即让 `valid_context.roles` 真正参与替换规则匹配）：**未采纳，继续搁置**。V0.5 搁置的理由是"样本太少"，现在样本已经不是瓶颈（22 篇全标注），但本版本判断 `substitutions/` 收窄到只剩 `replace` 类之后，样本量反而更小、更需要个案审核，通用规则匹配的优先级没有提升。`packages/recipe-domain/src/replacement.ts` 里"角色/技法条件规则永远不生效，只有精确 `recipe_ids` 匹配才生效"的保守判断维持不变。积累几个"如果角色匹配能生效就能答上"的真实场景后再重新评估。
- **设计方向 3**（食材功能分组）：维持 V0.5 的搁置结论和重新评估触发条件不变，本版本未涉及。
- **设计方向 4**（菜谱关系结构化维度 `balance_dimensions`）：**被本版本取代，不再推进**。它试图给 `relations/` 模型做加法，而本版本判断 `relations/` 模型本身的维护成本已经不可持续，直接整体替换为 `dish_role`，`balance_dimensions` 所属的 schema 已随 `relations/` 一起删除。

## 非目标

- 不改变 V0.4 已发布的八个 MCP 工具的对外名称；`search_recipes` 新增 `dish_role` 输入/输出字段和 `find_replacements` 输出中不再出现 `variant_of`/`alternative_to` 值，均属于向后兼容的扩展/收窄，不需要新工具或破坏性版本升级。
- 不实现"食材覆盖率排序"（V0.5 提到的第一类场景），仍然不在范围内。
- 不建立通用角色规则的置信度分层机制（V0.5 设计方向 2），继续搁置，理由见上。
- 不处理多用餐人偏好不同这类多主体约束，延续既有边界。
- `reviseInPlace` 不扩展成"任意内容都能原地改"——具体收紧条件（只改当前版本、拒绝改名、强制沿用身份字段）是本版本的一部分，不是留待将来补的细节。

## 风险

| 风险 | 说明 |
| --- | --- |
| `mixed`/`other` 样本小导致候选池被清空 | 目前只有 3 篇菜谱是 `mixed`，实测发现同分类候选恰好共享某个食材（如都放葱花点缀）时，`unavailable_ingredients` 一过滤就可能清空整个候选池；样本增长前会持续存在，是分类粒度的真实局限，不是逻辑缺陷 |
| 丢失细腻的人工搭配理由 | 原 `relations/` 里"这两道菜具体为什么搭"的理由，除已手工保留的 2 条过敏原/用时提醒外，其余随删除文件一并丢失，改为由 `dish_role` 的粗粒度分类推导 |
| `reviseInPlace` 误用风险 | 命令形状（`--minor-edit` 必填）和校验（拒绝改名、强制身份字段）已尽量降低误用可能，但仍依赖调用方对"算不算小改"的判断；判断错误会让本该走升版本的实质性改动被错误地原地覆盖 |
| 份量缩放折扣系数是经验值 | 五折（`1 + (rawScale-1)*0.5`）是基于"做菜经验直觉"的固定系数，不是从真实用量数据反推的，可能对某些食材/菜谱不够准确，需要在实际使用中观察调整 |

## 验收标准（本版本，已验证）

1. `npm run recipe -- validate` 通过，22 篇已发布菜谱全部带 `dish_role`。
2. `find_replacements` 对已标注 `dish_role` 的菜谱，`recipe_alternatives` 全部来自同 `dish_role` 的确定性检索（`relation_type: derived`），不再依赖 `relations/`；未标注 `dish_role` 的菜谱触发 `NO_DISH_ROLE_ON_BASE` 警告而不是静默降级。
3. `substitutions/` 中不存在 `mode: omit` 的已发布规则；对应食材的 `optional`/`notes` 字段已承接原有指导信息。
4. 同一份量比例下，`seasoning`/`garnish`/`cooking_medium` 角色食材的缩放量按五折公式计算，`primary`/`supporting`/未标注角色食材保持线性缩放，`read_recipe`/`aggregate_shopping_list` 均已验证。
5. `reviseInPlace` 只能覆盖当前生效版本，拒绝旧版本/归档版本/改名，源文件中的身份字段被强制覆盖而非报错，均有测试覆盖。
6. `search_recipes` 同分候选组在不同次全新查询间顺序会变化，但同一次翻页内部不重复、不丢失，有确定性和统计性测试覆盖。
7. 全部改动通过 `npm test`（86/86）、`npm run typecheck`、`npm run skill:build && npm run skill:check`。

## 遗留问题

1. `dish_role` 最初只有五类，落地后当场发现不够用，已追加 `mixed`/`other` 两类并把 3 篇菜谱（番茄炒蛋、麻婆豆腐、胡萝卜炒鸡蛋）改归 `mixed`；青椒肉丝有真实猪肉，维持 `protein` 不变。这 3 篇的归类仍是内容判断，值得维护者过一遍确认，不是阻塞性问题。
2. `mixed`/`other` 目前样本很小，`find_replacements` 在缺货食材恰好是同分类候选的共同食材时会出现候选池被清空的情况（已在"风险"一节记录）；样本积累后这个问题会自然缓解，不需要现在额外处理。
3. `packages/recipe-domain/src/replacement.ts` 里 `valid_context.roles` 仍未真正参与替换规则匹配（见"设计方向 2"处置），如果未来出现真实需求，需要单独评审再实施，不属于本版本范围。
4. 本版本未新增或修改任何 `PRD/` 之外需要用户提供真实使用经验才能确认的事实（如具体菜谱内容），符合 `MAINTENANCE.md` 的分工原则。
