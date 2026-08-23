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
    if (doc.region !== region) continue;
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
        warnings: ["基准价格为维护者维护的参考区间，非实时价格"],
      });
    }
    return out;
  }
}
