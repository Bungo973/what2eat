import type { CatalogIndex } from "./catalog.ts";
import type { KnowledgeRepo } from "./repo.ts";
import type { RecipeSearchService } from "./search.ts";
import type { Warning } from "./types.ts";

export interface FindReplacementsInput {
  recipe_id: string;
  version?: number | null;
  reason: "unavailable" | "budget" | "preference";
  unavailable_ingredients?: string[];
  exclude_allergens?: string[];
  dietary_constraints?: string[];
  max_total_minutes?: number;
  equipment?: string[];
  limit?: number;
}

export function findReplacements(
  repo: KnowledgeRepo,
  catalog: CatalogIndex,
  search: RecipeSearchService,
  input: FindReplacementsInput,
) {
  const base = repo.getRecipe(input.recipe_id, input.version);
  const unavailable = new Set(
    (input.unavailable_ingredients ?? []).map((ref) => catalog.resolve(ref)?.id ?? ref),
  );
  const excludedAllergens = new Set(input.exclude_allergens ?? []);
  const baseIngredientIds = new Set(base.meta.ingredients.map((item) => item.id));
  const dishDefiningIngredientIds = new Set(
    base.meta.ingredients.filter((item) => item.defines_dish === true).map((item) => item.id),
  );
  const substitutions = repo
    .listPublishedSubstitutions()
    .filter((rule) => baseIngredientIds.has(rule.from_ingredient))
    // 换掉/省略会改变菜品身份的食材，不能包装成同一道菜的调整，只能走整菜候选（variant_of/alternative_to）。
    .filter((rule) => !dishDefiningIngredientIds.has(rule.from_ingredient))
    .filter(
      (rule) => {
        if (rule.valid_context.recipe_ids.includes(base.meta.recipe_id)) return true;
        // 菜谱没有结构化食材角色/技法时，不能猜测带条件的通用规则是否适用。
        return (
          rule.valid_context.recipe_ids.length === 0 &&
          rule.valid_context.roles.length === 0 &&
          rule.valid_context.techniques.length === 0
        );
      },
    )
    .filter((rule) => unavailable.size === 0 || unavailable.has(rule.from_ingredient))
    .filter((rule) => !rule.to_ingredient || !unavailable.has(rule.to_ingredient))
    .filter((rule) => !rule.allergen_changes.add.some((item) => excludedAllergens.has(item)))
    .map((rule) => ({
      substitution_id: rule.substitution_id,
      version: rule.version,
      from_ingredient: rule.from_ingredient,
      to_ingredient: rule.to_ingredient,
      mode: rule.mode,
      ratio: rule.ratio?.factor ?? null,
      step_changes: rule.step_changes,
      allergen_add: rule.allergen_changes.add,
      allergen_remove: rule.allergen_changes.remove,
      effects: rule.effects,
      reason:
        input.reason === "budget"
          ? "已发布可行规则；是否更省钱必须按替换后的采购量重新报价"
          : "已发布且适用于当前菜谱的替换规则",
    }));

  const candidates = search.search({
    meal_types: base.meta.meal_types,
    exclude_ingredients: [...unavailable],
    ...(input.exclude_allergens ? { exclude_allergens: input.exclude_allergens } : {}),
    ...(input.dietary_constraints ? { dietary_constraints: input.dietary_constraints } : {}),
    ...(input.max_total_minutes !== undefined
      ? { max_total_minutes: input.max_total_minutes }
      : {}),
    ...(input.equipment ? { equipment: input.equipment } : {}),
    limit: 50,
  }).items;
  const byId = new Map(candidates.map((item) => [item.recipe_id, item]));
  const explicit: Array<{
    recipe_id: string;
    version: number;
    name: string;
    total_minutes: number;
    relation_type: "variant_of" | "alternative_to";
    reason: string;
    shared_ingredient_count: number;
    allergens: string[];
  }> = [];
  for (const relation of repo.listPublishedRecipeRelations()) {
    if (relation.type !== "variant_of" && relation.type !== "alternative_to") continue;
    if (
      relation.conditions?.meal_types?.length &&
      !relation.conditions.meal_types.some((mealType) => base.meta.meal_types.includes(mealType))
    ) {
      continue;
    }
    let target: string | null = null;
    if (relation.source_recipe_id === base.meta.recipe_id) target = relation.target_recipe_id;
    else if (relation.target_recipe_id === base.meta.recipe_id) target = relation.source_recipe_id;
    if (!target || target === base.meta.recipe_id) continue;
    const item = byId.get(target);
    if (!item) continue;
    explicit.push({
      recipe_id: item.recipe_id,
      version: item.version,
      name: item.name,
      total_minutes: item.total_minutes,
      relation_type: relation.type,
      reason: relation.reason,
      shared_ingredient_count: sharedCount(baseIngredientIds, item.core_ingredients.map((i) => i.id)),
      allergens: item.allergens,
    });
  }

  const explicitIds = new Set(explicit.map((item) => item.recipe_id));
  const derived = candidates
    .filter((item) => item.recipe_id !== base.meta.recipe_id && !explicitIds.has(item.recipe_id))
    .map((item) => ({
      recipe_id: item.recipe_id,
      version: item.version,
      name: item.name,
      total_minutes: item.total_minutes,
      relation_type: "derived" as const,
      reason: "同餐次且通过当前硬过滤的派生候选；采用前仍需读取正文、重新汇总和校验",
      shared_ingredient_count: sharedCount(baseIngredientIds, item.core_ingredients.map((i) => i.id)),
      allergens: item.allergens,
    }))
    .sort((a, b) => {
      if (b.shared_ingredient_count !== a.shared_ingredient_count) {
        return b.shared_ingredient_count - a.shared_ingredient_count;
      }
      return Math.abs(a.total_minutes - totalMinutes(base)) - Math.abs(b.total_minutes - totalMinutes(base));
    });
  const limit = input.limit ?? 8;
  const recipeAlternatives = [...explicit, ...derived].slice(0, limit);
  const warnings: Warning[] = [];
  if (substitutions.length === 0 && explicit.length === 0) {
    warnings.push({
      code: "NO_CURATED_REPLACEMENT",
      message: "没有适用于当前条件的已发布替换规则或人工菜谱关系，整菜候选来自确定性过滤",
      subject: base.meta.recipe_id,
    });
  }
  for (const ingredientId of unavailable) {
    if (dishDefiningIngredientIds.has(ingredientId)) {
      warnings.push({
        code: "DISH_DEFINING_INGREDIENT_UNAVAILABLE",
        message: "该食材决定这道菜的身份，缺货时只提供整菜候选（变体/其他菜），不返回同菜谱内的省略或替换建议",
        subject: ingredientId,
      });
    }
  }
  return {
    base_recipe: {
      recipe_id: base.meta.recipe_id,
      version: base.meta.version,
      name: base.meta.name,
    },
    substitutions,
    recipe_alternatives: recipeAlternatives,
    warnings,
  };
}

function sharedCount(base: Set<string>, values: Array<string | null>): number {
  return values.filter((value): value is string => value !== null && base.has(value)).length;
}

function totalMinutes(doc: ReturnType<KnowledgeRepo["getRecipe"]>): number {
  return doc.meta.prep_minutes + doc.meta.cook_minutes;
}
