import type { IngredientCatalog, IngredientCategory, CatalogIngredient } from "./types.ts";

/** 食材目录索引：ID/别名/名称 解析与过敏原查询。 */
export class CatalogIndex {
  readonly catalog: IngredientCatalog;
  private byId = new Map<string, CatalogIngredient>();
  private byName = new Map<string, CatalogIngredient>();

  constructor(catalog: IngredientCatalog) {
    this.catalog = catalog;
    for (const ing of catalog.ingredients) {
      this.byId.set(ing.id, ing);
      this.byName.set(ing.canonical_name, ing);
      for (const alias of ing.aliases) {
        if (!this.byName.has(alias)) {
          this.byName.set(alias, ing);
        }
      }
    }
  }

  /** 精确 ID 命中 */
  byIdentifier(id: string): CatalogIngredient | null {
    return this.byId.get(id) ?? null;
  }

  /** ID → 名称 → 别名 依次解析 */
  resolve(ref: string): CatalogIngredient | null {
    return this.byId.get(ref) ?? this.byName.get(ref) ?? null;
  }

  /** 名称匹配（对未知形态的 ref 容错：去空格后精确匹配） */
  resolveLoose(ref: string): CatalogIngredient | null {
    return this.resolve(ref) ?? this.resolve(ref.trim());
  }

  /** 一组食材 ID 的过敏原并集（用于发布复核与方案校验） */
  allergenUnion(ingredientIds: string[]): Set<string> {
    const out = new Set<string>();
    for (const id of ingredientIds) {
      const ing = this.byId.get(id);
      if (ing) for (const tag of ing.allergen_tags) out.add(tag);
    }
    return out;
  }
}

export const CATEGORY_LABELS: Record<IngredientCategory, string> = {
  vegetable: "蔬菜",
  fruit: "水果",
  meat: "肉类",
  egg_dairy: "蛋奶",
  aquatic: "水产",
  grain: "主食粮油",
  oil_condiment: "调味油品",
  spice: "香料干货",
  other: "其他",
};

export const CATEGORY_ORDER: IngredientCategory[] = [
  "vegetable",
  "meat",
  "egg_dairy",
  "aquatic",
  "grain",
  "oil_condiment",
  "spice",
  "fruit",
  "other",
];
