export type PriceDataType = "realtime" | "cached" | "benchmark";
export type PriceConfidence = "low" | "medium" | "high";

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
  warnings?: string[];
}

export interface ProviderQueryItem {
  ingredient_id: string;
  name: string;
}

export interface PriceProvider {
  readonly name: string;
  supports(region: string): boolean;
  quote(items: ProviderQueryItem[], region: string): Promise<ProviderQuote[]>;
}
