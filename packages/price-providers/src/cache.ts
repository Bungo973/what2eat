import type { ProviderQuote } from "./types.ts";

/** 分类目缓存 TTL（小时）：生鲜 24h，水产/水果 48h，常温 72h（PRD §10.3）。 */
const CATEGORY_TTL_HOURS: Record<string, number> = {
  vegetable: 24,
  meat: 24,
  egg_dairy: 24,
  aquatic: 48,
  fruit: 48,
  grain: 72,
  oil_condiment: 72,
  spice: 72,
  other: 72,
};

interface CacheEntry {
  quote: ProviderQuote;
  category: string;
  fetchedAt: number;
}

/** 内存价格缓存：可删除重建的派生数据（PRD §4.3）。 */
export class PriceCache {
  private entries = new Map<string, CacheEntry>();
  public hits = 0;
  public misses = 0;

  get(region: string, ingredientId: string): ProviderQuote | null {
    const entry = this.entries.get(this.key(region, ingredientId));
    if (!entry) {
      this.misses++;
      return null;
    }
    const ttlMs = (CATEGORY_TTL_HOURS[entry.category] ?? 24) * 3600 * 1000;
    if (Date.now() - entry.fetchedAt > ttlMs) {
      this.entries.delete(this.key(region, ingredientId));
      this.misses++;
      return null;
    }
    this.hits++;
    return { ...entry.quote, source: { ...entry.quote.source, type: "cached" } };
  }

  set(region: string, ingredientId: string, category: string, quote: ProviderQuote): void {
    this.entries.set(this.key(region, ingredientId), {
      quote,
      category,
      fetchedAt: Date.now(),
    });
  }

  clear(): void {
    this.entries.clear();
    this.hits = 0;
    this.misses = 0;
  }

  private key(region: string, ingredientId: string): string {
    return `${region}|${ingredientId}`;
  }
}
