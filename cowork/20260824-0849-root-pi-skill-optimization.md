# 优化 Pi Skill 自包含性、份数一致性与同餐多菜

- Agent：root
- 时间：2026-08-24T08:49:14+08:00
- 状态：完成
- 任务：根据 Pi Agent 真实测试结果，修复 Skill 包外引用、1 人份数量混用和校验器“一餐一菜”限制。

## 修改

- `skills/meal-planning/SKILL.md`：全部规范链接改为 Skill 包内 references；明确不得探测包外 `specs/`；强化目标份数、`scaled_ingredients` 与采购结果不可混用规则；明确同餐允许多道不同菜。
- `specs/behavior/meal-planning.md`：补充同餐多菜语义、单道菜时间约束假设，以及目标份数贯穿读取、汇总与校验的不变量。
- `specs/behavior/user-output.md`：要求目标份数不同时只展示缩放食材，采购数字以工具汇总为准，两种单位必须对应同一数量。
- `skills/meal-planning/references/meal-planning.md`、`skills/meal-planning/references/user-output.md`：由共享行为事实源生成的自包含分发副本。
- `scripts/build-skill.mjs`：新增确定性 Skill 构建/检查脚本，将 `specs/behavior/` 机械同步到 Skill references，并在副本缺失或漂移时失败。
- `package.json`：新增 `skill:build`、`skill:check`；根构建先检查 Skill 引用同步，再执行 workspace 类型检查。
- `packages/recipe-domain/src/validator.ts`：同一日期和餐次允许多道不同菜；只把同餐重复的同一 `recipe_id` 作为硬错误。
- `specs/tools/validate-meal-plan.output.schema.json`：新增向后兼容的 `DUPLICATE_RECIPE_IN_SLOT` 错误码；保留旧 `DUPLICATE_MEAL_SLOT` 枚举，避免收窄已发布输出契约。
- `tests/skill.test.ts`：验证所有 Markdown 引用留在 Skill 包内，并验证生成副本与共享事实源逐字同步。
- `tests/recipe-domain.test.ts`：覆盖同餐多菜通过、同餐重复同菜失败和餐次完整性。
- `tests/agent-scenarios/scenarios.test.ts`：新增真实本地 MCP 场景，验证 1 人份番茄 200g、采购 0.4 斤一致，且同一晚餐两道菜校验通过。
- `README.md`、`specs/README.md`：登记 Skill 构建/检查命令、生成副本规则和 53 个测试。

## 决定

- Skill 分发产物必须自包含，兼容 Pi 对 Skill 目录边界和相对引用的要求；仓库级行为规范仍由 `specs/behavior/` 单点维护。
- 不让 Agent 自行复制或猜测包外规范；生成由脚本完成，构建阶段检查漂移。
- 一个餐次允许多道不同菜。`expected_scope` 表示餐次至少有一道菜；`max_cooking_minutes` 当前继续按单道菜校验，不伪造整餐并行耗时。
- 同一餐次重复相同菜谱仍为硬错误；同菜谱不同版本也视为同菜重复。
- 采购清单与价格预算仍分离：用户未要求估价或未给预算时不调用价格工具，此规则未改变。
- 本轮不创建提交、不推送。

## 验证

- `npm run skill:build`：通过，生成两个包内行为 reference。
- `npm run skill:check`：通过，生成副本与共享事实源一致。
- `npx vitest run tests/skill.test.ts tests/recipe-domain.test.ts tests/agent-scenarios/scenarios.test.ts tests/tool-contracts/schemas.test.ts`：通过，33/33。
- `npm test`：通过，6 个测试文件、53/53。
- `npm run build`：通过；Skill 同步检查和三个 workspace 严格 TypeScript 检查全部通过。
- `npm run recipe -- validate`：通过，16 道已发布菜谱校验通过。
- 未完成标记扫描与 `git diff --check`：通过。
- `skill-creator/scripts/quick_validate.py skills/meal-planning`：未能运行；工作区 Python 仍缺少 PyYAML（`ModuleNotFoundError: yaml`）。未记录为通过；frontmatter、包内路径与引用同步由 `tests/skill.test.ts` 覆盖。

## 遗留

- 建议用户在 Pi 中重新复制整个 `skills/meal-planning/` 目录后复测，不能只替换 `SKILL.md`。
- 多道菜的“整餐总耗时”尚未建模；当前只校验每道菜的时间上限。若要支持并行烹饪排程，应另行定义明确契约，不在 MCP 中引入宽泛方案生成。
