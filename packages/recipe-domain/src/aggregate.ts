import { CATEGORY_LABELS, CATEGORY_ORDER, CatalogIndex } from "./catalog.ts";
import type { KnowledgeRepo } from "./repo.ts";
import { fromBaseUnit, round2, toBaseUnit } from "./units.ts";
import type { BaseUnit, CatalogIngredient, Warning } from "./types.ts";

export interface AggregateItemInput {
  recipe_id: string;
  version?: number | null;
  servings: number;
  date?: string;
}

export interface OwnedIngredientInput {
  ingredient: string;
  quantity: number;
  unit: "g" | "kg" | "ml" | "l" | "piece" | "两" | "斤";
}

interface AccumulatedEntry {
  ingredient: CatalogIngredient | null;
  name: string;
  baseQuantity: number;
  baseUnit: BaseUnit | null;
  convertible: boolean;
  usedIn: Array<{
    recipe_id: string;
    version: number;
    servings: number;
    quantity: number | null;
    unit: string | null;
    date?: string;
  }>;
}

/** 确定性采购汇总：跨菜谱合并、扣库存、按类目分组（PRD §8.4）。 */
export function aggregateShoppingList(
  repo: KnowledgeRepo,
  catalog: CatalogIndex,
  items: AggregateItemInput[],
  owned: OwnedIngredientInput[] = [],
): Record<string, unknown> {
  const warnings: Warning[] = [];
  const unresolved: Array<{ subject: string; reason: string }> = [];
  const accumulated = new Map<string, AccumulatedEntry>();

  for (const item of items) {
    if (!Number.isFinite(item.servings) || item.servings <= 0) {
      unresolved.push({ subject: item.recipe_id, reason: "份数必须是正有限数" });
      continue;
    }
    let doc;
    try {
      doc = repo.getRecipe(item.recipe_id, item.version);
    } catch {
      unresolved.push({ subject: item.recipe_id, reason: "菜谱或版本不存在" });
      continue;
    }
    const scale = item.servings / doc.meta.servings;
    for (const ing of doc.meta.ingredients) {
      const cat = catalog.byIdentifier(ing.id) ?? catalog.resolveLoose(ing.name);
      const key = cat?.id ?? `name:${ing.name}`;
      let entry = accumulated.get(key);
      if (!entry) {
        entry = {
          ingredient: cat,
          name: cat?.canonical_name ?? ing.name,
          baseQuantity: 0,
          baseUnit: null,
          convertible: true,
          usedIn: [],
        };
        accumulated.set(key, entry);
      }
      entry.usedIn.push({
        recipe_id: doc.meta.recipe_id,
        version: doc.meta.version,
        servings: item.servings,
        quantity: ing.quantity,
        unit: ing.unit,
        ...(item.date ? { date: item.date } : {}),
      });
      if (!cat) {
        entry.convertible = false;
        warnings.push({
          code: "UNKNOWN_INGREDIENT",
          message: `${ing.name} 不在标准食材目录中，仅按名称合并，无法换算单位`,
          subject: ing.name,
        });
        continue;
      }
      if (ing.quantity == null || ing.unit == null) {
        entry.convertible = entry.convertible && false;
        warnings.push({
          code: "NON_QUANTIFIED",
          message: `${cat.canonical_name} 在 ${doc.meta.recipe_id} 中未量化，不计入采购量`,
          subject: cat.id,
        });
        continue;
      }
      const conv = toBaseUnit(cat, ing.quantity * scale, ing.unit);
      if (!conv.ok) {
        entry.convertible = false;
        warnings.push({
          code: "UNIT_UNCONVERTIBLE",
          message: `${cat.canonical_name} 的 ${ing.quantity}${ing.unit} 无法换算为基准单位，保留原值`,
          subject: cat.id,
        });
        continue;
      }
      if (conv.approximate) {
        warnings.push({
          code: "APPROXIMATE_CONVERSION",
          message: `${cat.canonical_name} 使用近似换算（${ing.unit} → ${conv.baseUnit}）`,
          subject: cat.id,
        });
      }
      if (entry.baseUnit && entry.baseUnit !== conv.baseUnit) {
        entry.convertible = false;
        warnings.push({
          code: "UNIT_MISMATCH",
          message: `${cat.canonical_name} 出现不同基准单位（${entry.baseUnit} 与 ${conv.baseUnit}），按首次出现单位保留`,
          subject: cat.id,
        });
        continue;
      }
      entry.baseUnit = conv.baseUnit;
      entry.baseQuantity += conv.value;
    }
  }

  // 已有库存换算到基准单位并扣除
  const ownedBase = new Map<string, { quantity: number; baseUnit: BaseUnit }>();
  for (const own of owned) {
    const cat = catalog.resolveLoose(own.ingredient);
    if (!cat) {
      warnings.push({
        code: "UNKNOWN_INGREDIENT",
        message: `库存 ${own.ingredient} 不在标准食材目录中，忽略`,
        subject: own.ingredient,
      });
      continue;
    }
    const conv = toBaseUnit(cat, own.quantity, own.unit);
    if (!conv.ok) {
      warnings.push({
        code: "UNIT_UNCONVERTIBLE",
        message: `库存 ${cat.canonical_name} 的 ${own.quantity}${own.unit} 无法换算，忽略`,
        subject: cat.id,
      });
      continue;
    }
    const prev = ownedBase.get(cat.id);
    if (prev && prev.baseUnit === conv.baseUnit) {
      prev.quantity += conv.value;
    } else {
      ownedBase.set(cat.id, { quantity: conv.value, baseUnit: conv.baseUnit });
    }
  }

  const groupsMap = new Map<string, Array<Record<string, unknown>>>();
  for (const entry of accumulated.values()) {
    const category = entry.ingredient?.category ?? "other";
    const list = groupsMap.get(category) ?? [];

    const ownedQty = entry.ingredient ? ownedBase.get(entry.ingredient.id) : undefined;
    let ownedPart: { quantity: number; unit: string } | undefined;
    let remaining = entry.baseQuantity;
    if (ownedQty && entry.baseUnit === ownedQty.baseUnit && entry.convertible) {
      remaining = Math.max(0, entry.baseQuantity - ownedQty.quantity);
      const purchaseUnit = entry.ingredient?.default_purchase_unit ?? ownedQty.baseUnit;
      const ownedDisplay = fromBaseUnit(
        entry.ingredient,
        Math.min(entry.baseQuantity, ownedQty.quantity),
        ownedQty.baseUnit,
        purchaseUnit,
      );
      if (ownedDisplay.ok) {
        ownedPart = { quantity: round2(ownedDisplay.value), unit: purchaseUnit };
      } else {
        ownedPart = { quantity: round2(Math.min(entry.baseQuantity, ownedQty.quantity)), unit: ownedQty.baseUnit };
      }
    }

    let totalDisplay: { quantity: number | null; unit: string | null };
    let buyDisplay: { quantity: number | null; unit: string | null };
    if (entry.convertible && entry.baseUnit) {
      const purchaseUnit = entry.ingredient?.default_purchase_unit ?? entry.baseUnit;
      const totalConv = fromBaseUnit(entry.ingredient, entry.baseQuantity, entry.baseUnit, purchaseUnit);
      const buyConv = fromBaseUnit(entry.ingredient, remaining, entry.baseUnit, purchaseUnit);
      totalDisplay = totalConv.ok
        ? { quantity: round2(totalConv.value), unit: purchaseUnit }
        : { quantity: round2(entry.baseQuantity), unit: entry.baseUnit };
      buyDisplay = buyConv.ok
        ? { quantity: round2(buyConv.value), unit: purchaseUnit }
        : { quantity: round2(remaining), unit: entry.baseUnit };
    } else {
      totalDisplay = { quantity: null, unit: null };
      buyDisplay = { quantity: null, unit: null };
    }

    list.push({
      ingredient_id: entry.ingredient?.id ?? null,
      name: entry.name,
      total_required: totalDisplay,
      ...(ownedPart ? { owned: ownedPart } : {}),
      to_buy: buyDisplay,
      used_in: entry.usedIn,
    });
    groupsMap.set(category, list);
  }

  const groups = CATEGORY_ORDER.filter((c) => groupsMap.has(c)).map((c) => ({
    category: CATEGORY_LABELS[c],
    items: groupsMap.get(c)!,
  }));

  return { groups, warnings, unresolved };
}
