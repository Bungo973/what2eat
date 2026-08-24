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
  allow_national_fallback?: boolean;
}

export interface QuoteOutput {
  region: string;
  currency: "CNY";
  quotes: Array<{
    ingredient_id: string;
    name: string;
    requested_quantity: { quantity: number; unit: string } | null;
    quantity: number | null;
    unit: string;
    unit_price: { low: number; high: number };
    total_price: { low: number; high: number } | null;
    region: string;
    merchant: string;
    source: { type: "realtime" | "cached" | "benchmark"; name: string; url: string | null };
    data_time: string | null;
    confidence: "low" | "medium" | "high";
    requested_region: string;
    matched_region: string;
    region_code: string | null;
    region_scope: "market" | "city" | "province" | "national" | "unknown";
    region_match: boolean;
    is_fallback: boolean;
    price_basis: "wholesale_observed" | "national_wholesale_average" | "retail_estimate" | "unknown";
    budget_usable: "verified" | "reference_only";
    market_count: number | null;
    aggregation_method: string | null;
  }>;
  unmatched: Array<{ ingredient: string; reason: string }>;
  warnings: Warning[];
  summary: {
    requested_count: number;
    quoted_count: number;
    priced_count: number;
    exact_region_priced_count: number;
    province_priced_count: number;
    national_fallback_count: number;
    cross_region_fallback_count: number;
    benchmark_priced_count: number;
    unmatched_count: number;
    budget_status: "verified" | "reference_only" | "incomplete";
    complete: boolean;
    priced_subtotal: { low: number; high: number } | null;
  };
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

    const prepared = request.ingredients.map((item) => ({ item, cat: this.catalog.resolveLoose(item.ingredient) }));
    const uniqueCatalog = new Map<string, CatalogIngredient>();
    for (const entry of prepared) {
      if (entry.cat) uniqueCatalog.set(entry.cat.id, entry.cat);
      else unmatched.push({ ingredient: entry.item.ingredient, reason: "不在标准食材目录中，无法查询" });
    }

    const resolved = new Map<string, ProviderQuote>();
    for (const cat of uniqueCatalog.values()) {
      const cached = this.cache.get(request.region, cat.id, request.channel);
      if (!cached) continue;
      if (request.allow_national_fallback === false && !quoteMatchesRegion(cached, request.region)) continue;
      this.applyAgePolicy(cached, request, warnings);
      resolved.set(cat.id, cached);
    }

    for (const provider of this.orderedProviders(request.channel)) {
      const pending = [...uniqueCatalog.values()].filter((cat) => !resolved.has(cat.id));
      if (pending.length === 0) break;
      if (!provider.supports(request.region)) continue;
      let providerQuotes: ProviderQuote[];
      try {
        const providerOptions = {
          ...(request.allow_national_fallback === undefined
            ? {}
            : { allow_national_fallback: request.allow_national_fallback }),
          ...(request.channel === undefined ? {} : { channel: request.channel }),
        };
        providerQuotes = await provider.quote(
          pending.map((cat) => ({ ingredient_id: cat.id, name: cat.canonical_name })),
          request.region,
          providerOptions,
        );
      } catch (error) {
        warnings.push({
          code: "PROVIDER_DEGRADED",
          message: `价格源 ${provider.name} 不可用：${(error as Error).message}，已降级`,
          subject: provider.name,
        });
        continue;
      }
      for (const hit of providerQuotes) {
        const cat = uniqueCatalog.get(hit.ingredient_id);
        if (!cat || resolved.has(cat.id)) continue;
        const regionMatch = quoteMatchesRegion(hit, request.region);
        if (request.allow_national_fallback === false && !regionMatch) continue;
        for (const message of hit.warnings ?? []) {
          warnings.push({ code: "PRICE_SOURCE_LIMITATION", message, subject: cat.id });
        }
        if (!regionMatch) {
          warnings.push({
            code: "REGION_FALLBACK",
            message: `${cat.canonical_name} 未取得 ${request.region}省级价格，使用 ${hit.region} 参考价`,
            subject: cat.id,
          });
        }
        this.cache.set(request.region, cat.id, cat.category, hit, request.channel);
        this.applyAgePolicy(hit, request, warnings);
        resolved.set(cat.id, hit);
      }
    }

    for (const { item, cat } of prepared) {
      if (!cat) continue;
      const quote = resolved.get(cat.id);
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
        requested_quantity:
          quantity != null && requestUnit != null
            ? { quantity, unit: requestUnit }
            : null,
        quantity,
        unit: quote.unit,
        unit_price: quote.unit_price,
        total_price: total,
        region: quote.region,
        merchant: quote.merchant,
        source: quote.source,
        data_time: quote.data_time,
        confidence: quote.confidence,
        requested_region: quote.requested_region ?? request.region,
        matched_region: quote.matched_region ?? quote.region,
        region_code: quote.region_code ?? null,
        region_scope: quote.region_scope ?? "unknown",
        region_match: quoteMatchesRegion(quote, request.region),
        is_fallback: quote.is_fallback ?? !quoteMatchesRegion(quote, request.region),
        price_basis:
          quote.price_basis ?? (quote.source.type === "benchmark" ? "retail_estimate" : "unknown"),
        budget_usable: quote.budget_usable ?? "reference_only",
        market_count: quote.market_count ?? null,
        aggregation_method: quote.aggregation_method ?? null,
      });
    }

    const priced = quotes.filter((quote) => quote.total_price !== null);
    const exactRegionPriced = priced.filter((quote) => sameRegion(quote.matched_region, request.region));
    const provincePriced = priced.filter(
      (quote) => quote.region_match && ["market", "city", "province"].includes(quote.region_scope),
    );
    const nationalFallback = priced.filter((quote) => quote.region_scope === "national");
    const crossRegionFallback = priced.filter((quote) => quote.is_fallback && quote.region_scope !== "national");
    const benchmarkPriced = priced.filter((quote) => quote.source.type === "benchmark");
    const pricedSubtotal = priced.length
      ? {
          low: round2(priced.reduce((sum, quote) => sum + quote.total_price!.low, 0)),
          high: round2(priced.reduce((sum, quote) => sum + quote.total_price!.high, 0)),
        }
      : null;
    const complete =
      unmatched.length === 0 &&
      priced.length === request.ingredients.length &&
      provincePriced.length === request.ingredients.length;
    const budgetStatus: QuoteOutput["summary"]["budget_status"] =
      unmatched.length > 0 || priced.length !== request.ingredients.length
        ? "incomplete"
        : quotes.every((quote) => quote.budget_usable === "verified")
          ? "verified"
          : "reference_only";

    return {
      region: request.region,
      currency: "CNY",
      quotes,
      unmatched,
      warnings,
      summary: {
        requested_count: request.ingredients.length,
        quoted_count: quotes.length,
        priced_count: priced.length,
        exact_region_priced_count: exactRegionPriced.length,
        province_priced_count: provincePriced.length,
        national_fallback_count: nationalFallback.length,
        cross_region_fallback_count: crossRegionFallback.length,
        benchmark_priced_count: benchmarkPriced.length,
        unmatched_count: unmatched.length,
        budget_status: budgetStatus,
        complete,
        priced_subtotal: pricedSubtotal,
      },
    };
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

function sameRegion(actual: string, requested: string): boolean {
  const normalize = (value: string) => value.trim().replace(/[市省]$/, "");
  return normalize(actual) === normalize(requested);
}

function quoteMatchesRegion(quote: ProviderQuote, requested: string): boolean {
  return quote.region_match ?? sameRegion(quote.region, requested);
}

/** 供 server 端注入：把 ToolError 语义保留在工具层。 */
export function ensureRegion(region: string): string {
  const trimmed = region.trim();
  if (!trimmed) {
    throw new ToolError("INVALID_ARGUMENT", "region 不能为空");
  }
  return trimmed;
}
