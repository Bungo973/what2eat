import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { parseMarkdown } from "@what2eat/recipe-domain";
import { validateBenchmarkPrices } from "@what2eat/recipe-domain";
import type { PriceProvider, ProviderQuote, ProviderQueryItem } from "./types.ts";

export interface BenchmarkDoc {
  region: string;
  currency: "CNY";
  updated_at: string;
  basis: string;
  items: Array<{
    ingredient_id: string;
    unit: string;
    price_range: { low: number; high: number };
    source: string;
    recorded_at: string;
  }>;
}

/** 读取 knowledge/prices/ 下指定地区的基准价文档。 */
export function loadBenchmarkDoc(pricesDir: string, region: string): BenchmarkDoc | null {
  if (!existsSync(pricesDir)) return null;
  for (const file of readdirSync(pricesDir)) {
    if (!file.endsWith(".md")) continue;
    const raw = readFileSync(join(pricesDir, file), "utf-8");
    let parsed;
    try {
      parsed = parseMarkdown(raw);
    } catch {
      continue;
    }
    const doc = parsed.meta as BenchmarkDoc & { schema_version?: number };
    if (!sameRegion(doc.region, region)) continue;
    if (!validateBenchmarkPrices(doc).ok) continue;
    return doc;
  }
  return null;
}

/** benchmark provider：维护者提供的地区基准价（PRD §10.2）。 */
export class BenchmarkProvider implements PriceProvider {
  readonly name = "benchmark";

  constructor(private readonly pricesDir: string) {}

  supports(region: string): boolean {
    return loadBenchmarkDoc(this.pricesDir, region) !== null;
  }

  async quote(items: ProviderQueryItem[], region: string): Promise<ProviderQuote[]> {
    const doc = loadBenchmarkDoc(this.pricesDir, region);
    if (!doc) return [];
    const byId = new Map(doc.items.map((i) => [i.ingredient_id, i]));
    const out: ProviderQuote[] = [];
    for (const item of items) {
      const entry = byId.get(item.ingredient_id);
      if (!entry) continue;
      out.push({
        ingredient_id: item.ingredient_id,
        name: item.name,
        unit: entry.unit,
        unit_price: { low: entry.price_range.low, high: entry.price_range.high },
        currency: "CNY",
        region,
        merchant: "维护者基准价",
        source: {
          type: "benchmark",
          name: `knowledge/prices（${doc.basis === "wholesale" ? "批发口径" : "零售估算口径"}）`,
          url: null,
        },
        data_time: entry.recorded_at,
        confidence: "low",
        requested_region: region,
        matched_region: region,
        region_code: null,
        region_scope: "city",
        region_match: true,
        is_fallback: false,
        price_basis: doc.basis === "wholesale" ? "wholesale_observed" : "retail_estimate",
        budget_usable: "reference_only",
        market_count: null,
        aggregation_method: "maintainer_benchmark_range",
        warnings: ["基准价格为维护者维护的参考区间，非实时价格"],
      });
    }
    return out;
  }
}

/**
 * 跨地区维护者参考价：只在实时、省级、全国来源都未命中后使用。
 * 返回实际基准地区并标记跨地区回退，不冒充请求地区价格。
 */
export class ReferenceBenchmarkProvider implements PriceProvider {
  readonly name = "reference_benchmark";

  constructor(
    private readonly pricesDir: string,
    private readonly referenceRegion = "北京",
  ) {}

  supports(region: string): boolean {
    return !sameRegion(region, this.referenceRegion) && loadBenchmarkDoc(this.pricesDir, this.referenceRegion) !== null;
  }

  async quote(items: ProviderQueryItem[], region: string): Promise<ProviderQuote[]> {
    const doc = loadBenchmarkDoc(this.pricesDir, this.referenceRegion);
    if (!doc) return [];
    const byId = new Map(doc.items.map((item) => [item.ingredient_id, item]));
    return items.flatMap((item): ProviderQuote[] => {
      const entry = byId.get(item.ingredient_id);
      if (!entry) return [];
      return [
        {
          ingredient_id: item.ingredient_id,
          name: item.name,
          unit: entry.unit,
          unit_price: { low: entry.price_range.low, high: entry.price_range.high },
          currency: "CNY",
          region: this.referenceRegion,
          merchant: `${this.referenceRegion}维护者基准价（跨地区参考）`,
          source: {
            type: "benchmark",
            name: `knowledge/prices（${doc.basis === "wholesale" ? "批发口径" : "零售估算口径"}，跨地区）`,
            url: null,
          },
          data_time: entry.recorded_at,
          confidence: "low",
          requested_region: region,
          matched_region: this.referenceRegion,
          region_code: this.referenceRegion === "北京" ? "110000" : null,
          region_scope: "city",
          region_match: false,
          is_fallback: true,
          price_basis: doc.basis === "wholesale" ? "wholesale_observed" : "retail_estimate",
          budget_usable: "reference_only",
          market_count: null,
          aggregation_method: "cross_region_maintainer_benchmark_range",
          warnings: [`${region}无可用报价，使用${this.referenceRegion}维护者基准价作跨地区参考，非当地价格`],
        },
      ];
    });
  }
}

function sameRegion(left: string, right: string): boolean {
  const normalize = (value: string) => value.trim().replace(/[市省]$/, "");
  return normalize(left) === normalize(right);
}
