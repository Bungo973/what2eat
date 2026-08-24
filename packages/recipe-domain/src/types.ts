export type MealType = "breakfast" | "lunch" | "dinner" | "snack";
export type Difficulty = "easy" | "medium" | "hard";
export type RecipeStatus = "draft" | "published" | "archived";
export type IngredientUnit = "g" | "kg" | "ml" | "l" | "piece" | "两" | "斤";
export type BaseUnit = "g" | "ml" | "piece";
export type IngredientCategory =
  | "vegetable"
  | "fruit"
  | "meat"
  | "egg_dairy"
  | "aquatic"
  | "grain"
  | "oil_condiment"
  | "spice"
  | "other";

export interface IngredientLine {
  id: string;
  name: string;
  quantity: number | null;
  unit: IngredientUnit | null;
  preparation?: string;
  notes?: string;
}

export interface RecipeMeta {
  schema_version: 1;
  recipe_id: string;
  version: number;
  status: RecipeStatus;
  name: string;
  summary: string;
  servings: number;
  prep_minutes: number;
  cook_minutes: number;
  meal_types: MealType[];
  difficulty: Difficulty;
  equipment: string[];
  tags: string[];
  dietary_labels: string[];
  allergens: string[];
  ingredients: IngredientLine[];
  source: { name: string; url: string | null };
  published_at?: string;
  archived_reason?: string;
}

export interface RecipeDocument {
  meta: RecipeMeta;
  body: string;
  /** 相对知识库根目录的路径，如 recipes/tomato-eggs/v2.md */
  relPath: string;
}

export interface CatalogIngredient {
  id: string;
  canonical_name: string;
  aliases: string[];
  category: IngredientCategory;
  default_purchase_unit: IngredientUnit;
  conversions: Array<{
    from_unit: IngredientUnit;
    to_unit: BaseUnit;
    factor: number;
    approximate?: boolean;
  }>;
  allergen_tags: string[];
  price_query_terms: Array<{
    source: "xinfadi" | "pfsc" | "jiangnan";
    terms: string[];
    external_id?: string;
    preferred_specs?: string[];
    unit_hint?: "斤" | "公斤";
  }>;
}

export interface IngredientCatalog {
  schema_version: 1;
  catalog_version: number;
  updated_at?: string;
  ingredients: CatalogIngredient[];
}

export type IngredientRole =
  | "primary"
  | "supporting"
  | "seasoning"
  | "garnish"
  | "cooking_medium";

export interface SubstitutionRule {
  schema_version: 1;
  substitution_id: string;
  version: number;
  status: RecipeStatus;
  from_ingredient: string;
  to_ingredient: string | null;
  mode: "replace" | "omit";
  valid_context: {
    roles: IngredientRole[];
    techniques: string[];
    recipe_ids: string[];
  };
  ratio?: { factor: number; notes?: string } | null;
  step_changes: string[];
  allergen_changes: { add: string[]; remove: string[] };
  effects: { flavor: string; texture: string; time_delta_minutes: number };
  evidence: {
    type: "recipe_source" | "maintainer_review" | "external_reference";
    source: string | null;
  };
  published_at?: string;
  notes?: string;
}

export interface RecipeRelation {
  schema_version: 1;
  relation_id: string;
  version: number;
  status: RecipeStatus;
  type: "variant_of" | "alternative_to" | "pairs_with" | "uses_leftover_from";
  source_recipe_id: string;
  target_recipe_id: string;
  reason: string;
  conditions?: { meal_types?: MealType[] };
  published_at?: string;
}

export interface Warning {
  code: string;
  message: string;
  subject?: string;
}

/** 一个菜谱在知识库中的当前状态（PRD §9.1 版本状态机）。 */
export interface RecipeState {
  recipeId: string;
  /** 全部非草稿版本号，升序 */
  versions: number[];
  /** 当前版本 = 最高非草稿版本 */
  currentVersion: number;
  currentStatus: "published" | "archived";
  /** 草稿版本号（drafts/ 目录），升序 */
  draftVersions: number[];
}
