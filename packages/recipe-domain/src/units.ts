import type { BaseUnit, CatalogIngredient, IngredientUnit } from "./types.ts";

/** 所有质量/体积单位的通用换算（精确，不近似）。 */
const UNIVERSAL_TO_BASE: Partial<Record<IngredientUnit, { base: BaseUnit; factor: number }>> = {
  g: { base: "g", factor: 1 },
  kg: { base: "g", factor: 1000 },
  ml: { base: "ml", factor: 1 },
  l: { base: "ml", factor: 1000 },
  斤: { base: "g", factor: 500 },
  两: { base: "g", factor: 50 },
};

export interface ConversionResult {
  ok: boolean;
  value?: number;
  baseUnit?: BaseUnit;
  approximate?: boolean;
  reason?: string;
}

/**
 * 将某食材的一个数量换算到基准单位（g/ml/piece）。
 * 优先使用目录中该食材的换算（如 鸡蛋 1个≈50g），否则使用通用单位制换算。
 * piece 无通用换算：目录未提供时返回不可换算。
 */
export function toBaseUnit(
  ingredient: CatalogIngredient | null,
  quantity: number,
  fromUnit: IngredientUnit,
): ConversionResult {
  if (ingredient) {
    for (const conv of ingredient.conversions) {
      if (conv.from_unit === fromUnit) {
        return {
          ok: true,
          value: quantity * conv.factor,
          baseUnit: conv.to_unit,
          approximate: conv.approximate === true,
        };
      }
    }
  }
  const universal = UNIVERSAL_TO_BASE[fromUnit];
  if (universal) {
    return { ok: true, value: quantity * universal.factor, baseUnit: universal.base };
  }
  return {
    ok: false,
    reason: fromUnit === "piece" ? "计数单位缺少每份克重换算" : `单位 ${fromUnit} 无法换算`,
  };
}

/** 基准单位数量换算回指定单位（用于以采购单位呈现）。 */
export function fromBaseUnit(
  ingredient: CatalogIngredient | null,
  baseQuantity: number,
  baseUnit: BaseUnit,
  toUnit: IngredientUnit,
): ConversionResult {
  if (baseUnit === "piece" && toUnit === "piece") {
    return { ok: true, value: baseQuantity, baseUnit };
  }
  const probe = toBaseUnit(ingredient, 1, toUnit);
  if (probe.ok && probe.baseUnit === baseUnit) {
    return { ok: true, value: baseQuantity / probe.value!, baseUnit };
  }
  return { ok: false, reason: `${baseUnit} 与 ${toUnit} 不可互换单位系` };
}

export function round2(n: number): number {
  return Math.round(n * 100) / 100;
}
