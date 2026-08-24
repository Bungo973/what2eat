export type PriceDataType = "realtime" | "cached" | "benchmark";
export type PriceConfidence = "low" | "medium" | "high";
export type PriceRegionScope = "market" | "city" | "province" | "national" | "unknown";
export type PriceBasis =
  | "wholesale_observed"
  | "national_wholesale_average"
  | "retail_estimate"
  | "unknown";
export type BudgetUsability = "verified" | "reference_only";

/** 单个食材报价（PRD §10.2 PriceProvider 统一接口）。 */
export interface ProviderQuote {
  ingredient_id: string;
  name: string;
  /** 单价计价单位，如 斤/公斤/500g/piece */
  unit: string;
  unit_price: { low: number; high: number };
  currency: "CNY";
  region: string;
  merchant: string;
  source: { type: PriceDataType; name: string; url: string | null };
  /** 数据本身的日期/时间 */
  data_time: string | null;
  confidence: PriceConfidence;
  requested_region?: string;
  matched_region?: string;
  region_code?: string | null;
  region_scope?: PriceRegionScope;
  region_match?: boolean;
  is_fallback?: boolean;
  price_basis?: PriceBasis;
  budget_usable?: BudgetUsability;
  market_count?: number | null;
  aggregation_method?: string | null;
  warnings?: string[];
}

export interface ProviderQueryItem {
  ingredient_id: string;
  name: string;
}

export interface PriceProvider {
  readonly name: string;
  supports(region: string): boolean;
  quote(
    items: ProviderQueryItem[],
    region: string,
    options?: { allow_national_fallback?: boolean; channel?: string | null },
  ): Promise<ProviderQuote[]>;
}
