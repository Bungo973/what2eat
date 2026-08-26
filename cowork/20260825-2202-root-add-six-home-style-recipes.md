# 新增 6 道家常菜谱（16 → 22 道）

- Agent：root
- 时间：2026-08-25T22:02:00+08:00
- 状态：完成
- 任务：按用户要求扩充知识库家常菜。先分析现有 16 道菜的覆盖缺口，提出候选方向由用户选定（猪肉炒菜／面条主食／素菜与汤／早餐四类全选），起草 6 道菜谱经用户确认后发布。

## 修改

- `knowledge/menu/recipes/tomato-egg-noodles/番茄鸡蛋面-v1.md`：新增。挂面 200g + 番茄 300g + 鸡蛋 2 个，早/午/晚三餐次，17 分钟。填补"主食仅蛋炒饭"缺口。
- `knowledge/menu/recipes/green-pepper-pork-strips/青椒肉丝-v1.md`：新增。猪里脊 250g + 青椒 200g，20 分钟，medium。填补"无猪肉炒菜"缺口。
- `knowledge/menu/recipes/vinegar-cabbage/醋溜白菜-v1.md`：新增。大白菜 400g，13 分钟，vegan。
- `knowledge/menu/recipes/cabbage-tofu-soup/白菜豆腐汤-v1.md`：新增。大白菜 300g + 豆腐 300g，3 人份，21 分钟，vegan。填补"汤仅 1 道"缺口。
- `knowledge/menu/recipes/carrot-scrambled-eggs/胡萝卜炒鸡蛋-v1.md`：新增。胡萝卜 250g + 鸡蛋 3 个，11 分钟。
- `knowledge/menu/recipes/millet-porridge/小米粥-v1.md`：新增。小米 100g，33 分钟，仅 breakfast。填补"早餐仅 2 道"缺口。
- `knowledge/menu/ingredients/ingredients.md`：新增 `pork_loin`（猪里脊，别名 里脊肉/里脊/猪瘦肉）、`millet`（小米，别名 黄小米/小黄米）两条目录条目。

## 决定

- **选菜依据来自数据分析而非随意挑选**：统计现有 16 道菜的餐次／标签／器具／耗时／主料分布，发现早餐仅 2 道（午晚各 13）、主食仅蛋炒饭、无猪肉炒菜、耗时在 30~87 分钟之间断档；同时发现目录 46 种食材中有 6 种（青椒、大白菜、胡萝卜、挂面、蚝油、香菜）未被任何菜谱使用。优先选择能同时填补缺口并消化闲置食材的菜品，使闲置食材从 6 种降至 1 种。
- **优先复用已有目录食材以避开价格缺口**：6 道菜中 4 道完全不需要新食材。仅 `青椒肉丝` 与 `小米粥` 各引入 1 种新食材，用户已明确表示价格"后面会维护上去"。
- **未给 `pork_loin`／`millet` 补基准价**，理由同前一记录：`prices/beijing-benchmark.md` 每条价格均有可追溯的批发锚点推导，无真实锚点时按 `AGENTS.md`"价格未知时返回未知，不以零代替"留空。
- **蚝油仍闲置**，未强行塞入菜谱。其经典用法（蚝油生菜）需要"生菜"，目录中不存在；不为消化食材而编造不典型做法。
- 全部 6 道菜均按 `create-draft` 语义先写入 `drafts/`（`status: draft`），经用户逐项确认"用量和步骤没问题"后才 `publish`，符合 `knowledge/menu/AGENTS.md` 规则 6（口味/能否食用属经验判断，发布前须用户确认）。
- `role`/`optional`/`defines_dish` 起草口径沿用前一记录：仅菜名身份主料标 `defines_dish: true`；调味料用 `optional: false` 表达"不能省"；`盐` 统一 `optional: true`。

## 验证

- 发布前预检：自建脚本对 6 份草稿逐一核对目录覆盖与过敏原并集，结果为**缺目录 0 项、复核需补 0 项、多声明 0 项**，声明的过敏原与目录推导完全一致。
- `npm run recipe -- validate`：通过（`校验通过：22 道已发布菜谱`）。
- `npm run typecheck`：通过。
- `npm test`：76/76 通过。
- `npm run skill:check`：`Skill 引用已同步`。
- 端到端：用真实知识库调 `aggregateShoppingList` 混合三道新菜（含 4 人份缩放），采购量换算正确（番茄鸡蛋面 4 人份 → 挂面 400g、番茄 1.2 斤），并正确产生 `NON_QUANTIFIED`（盐/糖）与 `APPROXIMATE_CONVERSION`（鸡蛋）警告。
- `drafts/` 已清空（publish 自动移除草稿）。

## 遗留

- **`pork_loin`、`millet` 缺基准价**（连同前一记录的 `chicken_thigh`，共 3 种）。涉及这些食材的菜谱报价会出现未知项，待用户或后续核价补 `prices/beijing-benchmark.md`。
- **新增 6 道菜尚未建立任何 `relations/` 关系**（搭配、整菜候选、变体）。例如醋溜白菜与蒜蓉西兰花／白灼菜心是否互作整菜候选、白菜豆腐汤配哪些主菜，均需用户确认后才能起草发布。现有 6 条 relations 仍只覆盖原有菜谱。
- **蚝油仍是唯一未被使用的目录食材**；若要消化需先补"生菜"等食材条目。
- 早餐仍偏少（新增小米粥后为 4 道，含番茄鸡蛋面与胡萝卜炒鸡蛋标注的 breakfast）；如需继续扩充，豆浆／皮蛋瘦肉粥／包子类均需新增食材条目。
