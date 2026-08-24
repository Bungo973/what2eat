import { CatalogIndex } from "./catalog.ts";
import type { KnowledgeRepo } from "./repo.ts";
import type { MealType, RecipeDocument } from "./types.ts";

export interface MealPlanMeal {
  date: string;
  meal_type: MealType;
  recipe_id: string;
  version?: number | null;
  servings: number;
}

export interface MealPlanConstraints {
  exclude_allergens?: string[];
  excluded_ingredients?: string[];
  dietary_patterns?: string[];
  max_cooking_minutes?: number;
  unavailable_equipment?: string[];
  budget?: { mode: "hard" | "soft"; amount: number; currency: "CNY" };
}

export interface MealPlanPricing {
  total_range: { low: number; high: number };
  currency: "CNY";
  complete?: boolean;
  budget_status?: "verified" | "reference_only" | "incomplete";
}

export interface PlanIssue {
  code: string;
  message: string;
  date?: string;
  meal_type?: string;
  recipe_id?: string;
  version?: number;
}

export interface MealPlanInput {
  meals: MealPlanMeal[];
  expected_scope?: { dates: string[]; meal_types: MealType[] };
  constraints?: MealPlanConstraints;
  pricing?: MealPlanPricing;
}

/** 方案确定性校验（PRD §8.5）：只校验，不生成。 */
export function validateMealPlan(
  repo: KnowledgeRepo,
  catalog: CatalogIndex,
  input: MealPlanInput,
): Record<string, unknown> {
  const errors: PlanIssue[] = [];
  const warnings: Array<{ code: string; message: string; subject?: string }> = [];
  const assumptions: string[] = [];
  const constraints = input.constraints ?? {};

  // 一个餐位可以有多道不同菜；完整性只要求餐位至少有一道菜。
  const slots = new Set<string>();
  for (const meal of input.meals) {
    const key = `${meal.date}|${meal.meal_type}`;
    slots.add(key);
  }

  // 完整性
  if (input.expected_scope) {
    for (const date of input.expected_scope.dates) {
      for (const mt of input.expected_scope.meal_types) {
        if (!slots.has(`${date}|${mt}`)) {
          errors.push({
            code: "MISSING_MEAL",
            message: `缺少 ${date} ${mt}`,
            date,
            meal_type: mt,
          });
        }
      }
    }
  }

  // 逐餐校验
  const recipeUsage = new Map<string, number>();
  const dishesInSlot = new Set<string>();
  for (const meal of input.meals) {
    const doc = resolveMealRecipe(repo, meal, errors);
    if (!doc) continue;
    const meta = doc.meta;
    const dishKey = `${meal.date}|${meal.meal_type}|${meta.recipe_id}`;
    if (dishesInSlot.has(dishKey)) {
      errors.push({
        code: "DUPLICATE_RECIPE_IN_SLOT",
        message: `${meal.date} ${meal.meal_type} 重复安排了 ${meta.name}（${meta.recipe_id}）`,
        date: meal.date,
        meal_type: meal.meal_type,
        recipe_id: meta.recipe_id,
        version: meta.version,
      });
      continue;
    }
    dishesInSlot.add(dishKey);
    recipeUsage.set(meta.recipe_id, (recipeUsage.get(meta.recipe_id) ?? 0) + 1);

    // 过敏原：frontmatter 声明 + 目录复核并集
    if (constraints.exclude_allergens?.length) {
      const declared = new Set(meta.allergens);
      const derived = catalog.allergenUnion(meta.ingredients.map((i) => i.id));
      const conflicts = constraints.exclude_allergens.filter(
        (a) => declared.has(a) || derived.has(a),
      );
      if (conflicts.length) {
        errors.push({
          code: "ALLERGEN_CONFLICT",
          message: `${meta.name}（${meta.recipe_id}）含过敏原 ${conflicts.join(", ")}（含食材目录复核）`,
          date: meal.date,
          meal_type: meal.meal_type,
          recipe_id: meta.recipe_id,
          version: meta.version,
        });
      }
    }

    // 忌口食材
    if (constraints.excluded_ingredients?.length) {
      for (const ref of constraints.excluded_ingredients) {
        const cat = catalog.resolve(ref);
        const hit = cat
          ? meta.ingredients.some((i) => i.id === cat.id)
          : meta.ingredients.some(
              (i) => i.name === ref || i.id === ref,
            );
        if (hit) {
          errors.push({
            code: "INGREDIENT_EXCLUDED",
            message: `${meta.name}（${meta.recipe_id}）包含忌口食材 ${ref}`,
            date: meal.date,
            meal_type: meal.meal_type,
            recipe_id: meta.recipe_id,
            version: meta.version,
          });
        }
      }
    }

    // 饮食方式
    if (constraints.dietary_patterns?.length) {
      const labels = new Set(meta.dietary_labels);
      const missing = constraints.dietary_patterns.filter((d) => !labels.has(d));
      if (missing.length) {
        errors.push({
          code: "DIETARY_CONFLICT",
          message: `${meta.name}（${meta.recipe_id}）不满足饮食方式 ${missing.join(", ")}`,
          date: meal.date,
          meal_type: meal.meal_type,
          recipe_id: meta.recipe_id,
          version: meta.version,
        });
      }
    }

    // 厨具
    if (constraints.unavailable_equipment?.length) {
      const unavailable = new Set(constraints.unavailable_equipment);
      const conflict = meta.equipment.filter((e) => unavailable.has(e));
      if (conflict.length) {
        errors.push({
          code: "EQUIPMENT_UNAVAILABLE",
          message: `${meta.name}（${meta.recipe_id}）需要不可用厨具 ${conflict.join(", ")}`,
          date: meal.date,
          meal_type: meal.meal_type,
          recipe_id: meta.recipe_id,
          version: meta.version,
        });
      }
    }

    // 时长
    const total = meta.prep_minutes + meta.cook_minutes;
    if (constraints.max_cooking_minutes != null && total > constraints.max_cooking_minutes) {
      errors.push({
        code: "TIME_EXCEEDED",
        message: `${meta.name}（${meta.recipe_id}）总时长 ${total} 分钟超过上限 ${constraints.max_cooking_minutes}`,
        date: meal.date,
        meal_type: meal.meal_type,
        recipe_id: meta.recipe_id,
        version: meta.version,
      });
    }
  }

  // 重复度
  for (const [id, count] of recipeUsage) {
    if (count > 2) {
      warnings.push({
        code: "HIGH_REPETITION",
        message: `${id} 在方案中出现 ${count} 次，重复度偏高`,
        subject: id,
      });
    }
  }

  // 预算
  const budget = constraints.budget;
  if (budget && budget.mode === "hard") {
    if (
      !input.pricing ||
      input.pricing.complete !== true ||
      (input.pricing.budget_status != null && input.pricing.budget_status !== "verified")
    ) {
      errors.push({
        code: "BUDGET_UNVERIFIED",
        message: "硬预算缺少完整且可用于验证的地区价格；批发价、全国回退或参考估算只能作为预算参考",
      });
    } else {
      const { low, high } = input.pricing.total_range;
      if (low > budget.amount) {
        errors.push({
          code: "BUDGET_EXCEEDED",
          message: `估价下限 ¥${low} 已超过硬预算 ¥${budget.amount}`,
        });
      } else if (high > budget.amount) {
        warnings.push({
          code: "BUDGET_TIGHT",
          message: `估价上限 ¥${high} 超过硬预算 ¥${budget.amount}，下限仍在预算内`,
        });
      }
    }
  }

  return {
    errors,
    warnings,
    assumptions,
    validated_at: new Date().toISOString(),
  };
}

function resolveMealRecipe(
  repo: KnowledgeRepo,
  meal: MealPlanMeal,
  errors: PlanIssue[],
): RecipeDocument | null {
  const state = (() => {
    try {
      return repo.stateOf(meal.recipe_id);
    } catch {
      return null;
    }
  })();
  if (!state) {
    errors.push({
      code: "RECIPE_NOT_FOUND",
      message: `菜谱不存在: ${meal.recipe_id}`,
      date: meal.date,
      meal_type: meal.meal_type,
      recipe_id: meal.recipe_id,
    });
    return null;
  }
  const targetVersion = meal.version ?? state.currentVersion;
  if (!state.versions.includes(targetVersion)) {
    errors.push({
      code: "VERSION_NOT_FOUND",
      message: `${meal.recipe_id} 不存在版本 v${targetVersion}`,
      date: meal.date,
      meal_type: meal.meal_type,
      recipe_id: meal.recipe_id,
      version: targetVersion,
    });
    return null;
  }
  try {
    const doc = repo.getRecipe(meal.recipe_id, targetVersion);
    if (meal.version == null && doc.meta.status !== "published") {
      errors.push({
        code: "RECIPE_NOT_PUBLISHED",
        message: `${meal.recipe_id} 当前状态为 ${doc.meta.status}，不可进入方案`,
        date: meal.date,
        meal_type: meal.meal_type,
        recipe_id: meal.recipe_id,
        version: targetVersion,
      });
      return null;
    }
    return doc;
  } catch {
    errors.push({
      code: "RECIPE_NOT_FOUND",
      message: `菜谱读取失败: ${meal.recipe_id}`,
      date: meal.date,
      meal_type: meal.meal_type,
      recipe_id: meal.recipe_id,
    });
    return null;
  }
}
