import { CatalogIndex, ToolError, toBaseUnit } from "@what2eat/recipe-domain";
import type { CatalogIngredient, Warning } from "@what2eat/recipe-domain";
import type { PriceCache } from "./cache.ts";
import type { PriceProvider, ProviderQuote } from "./types.ts";

export interface QuoteRequestItem {
  ingredient: string;
  quantity?: number | null;
  unit?: string | null;
}

export interface QuoteRequest {
  region: string;
  ingredients: QuoteRequestItem[];
  channel?: string | null;
  max_age_hours?: number | null;
}

export interface QuoteOutput {
  region: string;
  currency: "CNY";
  quotes: Array<{
    ingredient_id: string;
    name: string;
    quantity: number | null;
    unit: string;
    unit_price: { low: number; high: number };
    total_price: { low: number; high: number } | null;
    region: string;
    merchant: string;
    source: { type: "realtime" | "cached" | "benchmark"; name: string; url: string | null };
    data_time: string | null;
    confidence: "low" | "medium" | "high";
  }>;
  unmatched: Array<{ ingredient: string; reason: string }>;
  warnings: Warning[];
}

const GRAMS_PER_UNIT: Record<string, number> = {
  g: 1,
  kg: 1000,
  斤: 500,
  两: 50,
  公斤: 1000,
  ml: 1,
  l: 1000,
};

const CONFIDENCE_ORDER = ["low", "medium", "high"] as const;

function downgrade(confidence: "low" | "medium" | "high"): "low" | "medium" | "high" {
  const idx = CONFIDENCE_ORDER.indexOf(confidence);
  return CONFIDENCE_ORDER[Math.max(0, idx - 1)]!;
}

/**
 * 报价编排（PRD §10.3 降级链）：城市实时 → 缓存 → 基准价 → 全国参考 → 未知。
 * 每次降级保留数据类型、时间与可信度；不伪造精确价格。
 */
export class QuoteService {
  constructor(
    private readonly providers: PriceProvider[],
    private readonly cache: PriceCache,
    private readonly catalog: CatalogIndex,
  ) {}

  async quote(request: QuoteRequest): Promise<QuoteOutput> {
    const warnings: Warning[] = [];
    const unmatched: Array<{ ingredient: string; reason: string }> = [];
    const quotes: QuoteOutput["quotes"] = [];

    for (const item of request.ingredients) {
      const cat = this.catalog.resolveLoose(item.ingredient);
      if (!cat) {
        unmatched.push({ ingredient: item.ingredient, reason: "不在标准食材目录中，无法查询" });
        continue;
      }
      const quote = await this.resolveQuote(cat, request, warnings);
      if (!quote) {
        unmatched.push({ ingredient: item.ingredient, reason: "所有价格源均无该食材数据" });
        continue;
      }
      const quantity = item.quantity ?? null;
      const requestUnit = item.unit ?? null;
      let total: { low: number; high: number } | null = null;
      if (quantity != null && requestUnit) {
        const conversion = this.convertToRequestUnit(cat, quote, quantity, requestUnit);
        if (conversion.warnings.length) {
          for (const w of conversion.warnings) warnings.push({ ...w, subject: cat.id });
        }
        total = conversion.total;
      }
      quotes.push({
        ingredient_id: cat.id,
        name: cat.canonical_name,
        quantity,
        unit: quote.unit,
        unit_price: quote.unit_price,
        total_price: total,
        region: quote.region,
        merchant: quote.merchant,
        source: quote.source,
        data_time: quote.data_time,
        confidence: quote.confidence,
      });
    }

    return {
      region: request.region,
      currency: "CNY",
      quotes,
      unmatched,
      warnings,
    };
  }

  private async resolveQuote(
    cat: CatalogIngredient,
    request: QuoteRequest,
    warnings: Warning[],
  ): Promise<ProviderQuote | null> {
    const cached = this.cache.get(request.region, cat.id);
    if (cached) {
      this.applyAgePolicy(cached, request, warnings);
      return cached;
    }
    const ordered = this.orderedProviders(request.channel);
    for (const provider of ordered) {
      if (!provider.supports(request.region)) continue;
      let providerQuotes: ProviderQuote[];
      try {
        providerQuotes = await provider.quote(
          [{ ingredient_id: cat.id, name: cat.canonical_name }],
          request.region,
        );
      } catch (e) {
        warnings.push({
          code: "PROVIDER_DEGRADED",
          message: `价格源 ${provider.name} 不可用：${(e as Error).message}，已降级`,
          subject: cat.id,
        });
        continue;
      }
      const hit = providerQuotes.find((q) => q.ingredient_id === cat.id);
      if (hit) {
        this.cache.set(request.region, cat.id, cat.category, hit);
        this.applyAgePolicy(hit, request, warnings);
        return hit;
      }
    }
    return null;
  }

  private orderedProviders(channel?: string | null): PriceProvider[] {
    const providers = [...this.providers];
    if (channel === "supermarket") {
      // 零售估算优先基准价（retail_estimate 口径）
      providers.sort((a, b) => Number(b.name === "benchmark") - Number(a.name === "benchmark"));
    }
    return providers;
  }

  private applyAgePolicy(
    quote: ProviderQuote,
    request: QuoteRequest,
    warnings: Warning[],
  ): void {
    if (!request.max_age_hours || !quote.data_time) return;
    const dataTime = Date.parse(quote.data_time);
    if (Number.isNaN(dataTime)) return;
    const ageHours = (Date.now() - dataTime) / 3600 / 1000;
    if (ageHours > request.max_age_hours) {
      warnings.push({
        code: "STALE_PRICE",
        message: `数据时间 ${quote.data_time} 距今约 ${Math.round(ageHours)} 小时，超过要求的 ${request.max_age_hours} 小时，可信度已下调`,
        subject: quote.ingredient_id,
      });
      quote.confidence = downgrade(quote.confidence);
    }
  }

  private convertToRequestUnit(
    cat: CatalogIngredient,
    quote: ProviderQuote,
    quantity: number,
    requestUnit: string,
  ): { total: { low: number; high: number } | null; warnings: Warning[] } {
    const warns: Warning[] = [];
    const perGramQuote = GRAMS_PER_UNIT[quote.unit];
    if (perGramQuote != null && GRAMS_PER_UNIT[requestUnit] != null) {
      if (
        (quote.unit === "ml" || quote.unit === "l") !==
        (requestUnit === "ml" || requestUnit === "l")
      ) {
        warns.push({
          code: "UNIT_UNCONVERTIBLE",
          message: `报价单位（${quote.unit}）与请求单位（${requestUnit}）量纲不同，未计算总价`,
        });
        return { total: null, warnings: warns };
      }
      const factor = GRAMS_PER_UNIT[requestUnit]! / perGramQuote;
      return {
        total: {
          low: round2(quote.unit_price.low * factor * quantity),
          high: round2(quote.unit_price.high * factor * quantity),
        },
        warnings: warns,
      };
    }
    if (requestUnit === "piece") {
      const conv = toBaseUnit(cat, 1, "piece");
      const gramPerPiece = conv.ok ? conv.value : null;
      if (gramPerPiece && perGramQuote) {
        warns.push({
          code: "APPROXIMATE_CONVERSION",
          message: `按目录换算 1${cat.canonical_name}≈${gramPerPiece}g 估算总价（近似）`,
        });
        return {
          total: {
            low: round2(quote.unit_price.low * (gramPerPiece / perGramQuote) * quantity),
            high: round2(quote.unit_price.high * (gramPerPiece / perGramQuote) * quantity),
          },
          warnings: warns,
        };
      }
    }
    warns.push({
      code: "UNIT_UNCONVERTIBLE",
      message: `报价单位（${quote.unit}）无法换算到请求单位（${requestUnit}），保留单价区间`,
    });
    return { total: null, warnings: warns };
  }
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

/** 供 server 端注入：把 ToolError 语义保留在工具层。 */
export function ensureRegion(region: string): string {
  const trimmed = region.trim();
  if (!trimmed) {
    throw new ToolError("INVALID_ARGUMENT", "region 不能为空");
  }
  return trimmed;
}
