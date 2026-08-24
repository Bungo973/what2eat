import { createDecipheriv } from "node:crypto";
import { ToolError } from "@what2eat/recipe-domain";
import { resolveProvince, STATIC_PROVINCE_RECORDS, type RegionRecord } from "./regions.ts";
import type { PriceProvider, ProviderQuote, ProviderQueryItem } from "./types.ts";

export interface PfscMarketQueryConfig {
  external_id: string;
  terms: string[];
}

export type PfscMarketFetchFn = (url: string, init?: RequestInit) => Promise<Response>;

const BASE_URL = "https://pfsc.agri.cn";
const CHART_ENDPOINT = `${BASE_URL}/price_portal/index/getMarketReportPriceChart`;
const REGION_ENDPOINT = `${BASE_URL}/price_portal/region/selectList`;
const PUBLIC_TRANSPORT_KEY = "7s9K$pG2xQ8zR5mB7vA3sD9fH2jW40cV";
const TIMEOUT_MS = 8000;
const REGION_CACHE_MS = 24 * 3600 * 1000;
const MAX_CONCURRENCY = 5;

interface ChartPayload {
  date?: string;
  x?: unknown[];
  y?: unknown[];
}

interface RegionApiRecord {
  id?: unknown;
  name?: unknown;
  shortName?: unknown;
  pid?: unknown;
}

/**
 * 农业农村部逐品种、逐市场批发报价 provider。
 * 该通道来自官网公开前端；传输密钥只用于解开页面响应，不是鉴权凭证。
 */
export class PfscMarketProvider implements PriceProvider {
  readonly name = "pfsc_market";
  private regionRecords: RegionRecord[] | null = null;
  private regionFetchedAt = 0;

  constructor(
    private readonly resolveQuery: (ingredientId: string) => PfscMarketQueryConfig | null,
    private readonly fetchFn: PfscMarketFetchFn = fetch,
    private readonly chartEndpoint = CHART_ENDPOINT,
    private readonly regionEndpoint = REGION_ENDPOINT,
  ) {}

  supports(region: string): boolean {
    return region.trim().length > 0;
  }

  async quote(
    items: ProviderQueryItem[],
    region: string,
    options?: { allow_national_fallback?: boolean },
  ): Promise<ProviderQuote[]> {
    const mapped = items
      .map((item) => ({ item, config: this.resolveQuery(item.ingredient_id) }))
      .filter((entry): entry is { item: ProviderQueryItem; config: PfscMarketQueryConfig } => entry.config != null);
    if (mapped.length === 0) return [];

    const staticProvince = resolveProvince(region, STATIC_PROVINCE_RECORDS);
    const province = staticProvince ?? resolveProvince(region, await this.getRegionRecords());
    const allowNationalFallback = options?.allow_national_fallback !== false;
    const fetchErrors: Error[] = [];
    const provinceResults = province
      ? await mapLimit(mapped, MAX_CONCURRENCY, async (entry) => ({
          entry,
          ...(await this.tryFetchChart(entry.config.external_id, province.province_code)),
        }))
      : mapped.map((entry) => ({ entry, payload: null, error: null }));

    const out: ProviderQuote[] = [];
    const needsNational: typeof mapped = [];
    for (const result of provinceResults) {
      if (result.error) fetchErrors.push(result.error);
      const quote = result.payload
        ? this.toQuote(result.entry.item, result.entry.config, result.payload, region, province!, false)
        : null;
      if (quote) out.push(quote);
      else if (allowNationalFallback) needsNational.push(result.entry);
    }

    if (allowNationalFallback && needsNational.length > 0) {
      const nationalResults = await mapLimit(needsNational, MAX_CONCURRENCY, async (entry) => ({
        entry,
        ...(await this.tryFetchChart(entry.config.external_id, "")),
      }));
      for (const result of nationalResults) {
        if (result.error) fetchErrors.push(result.error);
        if (!result.payload) continue;
        const quote = this.toQuote(result.entry.item, result.entry.config, result.payload, region, province, true);
        if (quote) out.push(quote);
      }
    }
    if (out.length === 0 && fetchErrors.length > 0) throw fetchErrors[0]!;
    return out;
  }

  private toQuote(
    item: ProviderQueryItem,
    config: PfscMarketQueryConfig,
    payload: ChartPayload,
    requestedRegion: string,
    province: { province_code: string; province_name: string } | null,
    nationalFallback: boolean,
  ): ProviderQuote | null {
    const values = (payload.y ?? [])
      .map(Number)
      .filter((value) => Number.isFinite(value) && value > 0)
      .sort((a, b) => a - b);
    if (values.length === 0) return null;
    const low = round2(values.length < 4 ? values[0]! : quantile(values, 0.25));
    const high = round2(values.length < 4 ? values.at(-1)! : quantile(values, 0.75));
    const matchedRegion = nationalFallback ? "全国" : province!.province_name;
    const marketCount = values.length;
    return {
      ingredient_id: item.ingredient_id,
      name: item.name,
      unit: "公斤",
      unit_price: { low, high },
      currency: "CNY",
      region: matchedRegion,
      merchant: nationalFallback
        ? `全国批发市场聚合（${marketCount} 家）`
        : `${matchedRegion}批发市场聚合（${marketCount} 家）`,
      source: { type: "realtime", name: "pfsc-market", url: this.chartEndpoint },
      data_time: payload.date ?? null,
      confidence: nationalFallback || marketCount < 3 ? "low" : "medium",
      requested_region: requestedRegion,
      matched_region: matchedRegion,
      region_code: nationalFallback ? null : province!.province_code,
      region_scope: nationalFallback ? "national" : "province",
      region_match: !nationalFallback,
      is_fallback: nationalFallback,
      price_basis: nationalFallback ? "national_wholesale_average" : "wholesale_observed",
      budget_usable: "reference_only",
      market_count: marketCount,
      aggregation_method: marketCount < 4 ? "market_min_max" : "market_interquartile_range",
      warnings: [
        `PFSC 品种 ${config.terms[0] ?? config.external_id}，批发市场大宗交易均价，仅供参考，未含零售加价`,
        ...(nationalFallback
          ? [
              province
                ? `${province.province_name}市场当日无报价，已回退全国市场`
                : `无法将 ${requestedRegion} 稳定映射到省级行政区，已回退全国市场`,
            ]
          : []),
      ],
    };
  }

  private async getRegionRecords(): Promise<RegionRecord[]> {
    if (this.regionRecords && Date.now() - this.regionFetchedAt < REGION_CACHE_MS) return this.regionRecords;
    try {
      const data = await this.fetchJson(this.regionEndpoint, {
        method: "POST",
        headers: this.headers("application/json"),
        body: "{}",
      });
      const records = Array.isArray((data as { data?: unknown }).data)
        ? ((data as { data: RegionApiRecord[] }).data
            .map((record) => ({
              id: String(record.id ?? ""),
              name: String(record.name ?? ""),
              shortName: String(record.shortName ?? ""),
              pid: String(record.pid ?? ""),
            }))
            .filter((record) => record.id && record.name && record.pid))
        : [];
      this.regionRecords = records.length > 0 ? records : STATIC_PROVINCE_RECORDS;
    } catch {
      this.regionRecords = STATIC_PROVINCE_RECORDS;
    }
    this.regionFetchedAt = Date.now();
    return this.regionRecords;
  }

  private async fetchChart(varietyId: string, provinceCode: string): Promise<ChartPayload | null> {
    const params = new URLSearchParams({ marketIDs: "", provinceCodes: provinceCode, varietyID: varietyId });
    const data = await this.fetchJson(`${this.chartEndpoint}?${params.toString()}`, {
      method: "POST",
      headers: this.headers(),
    });
    const code = Number((data as { code?: unknown }).code);
    if (code !== 0 && code !== 200) return null;
    const encrypted = (data as { data?: unknown }).data;
    if (typeof encrypted !== "string") return null;
    try {
      return JSON.parse(decryptPayload(encrypted)) as ChartPayload;
    } catch (error) {
      throw new ToolError("PROVIDER_UNAVAILABLE", `农业农村部逐市场报价响应无法解析: ${(error as Error).message}`);
    }
  }

  private async tryFetchChart(
    varietyId: string,
    provinceCode: string,
  ): Promise<{ payload: ChartPayload | null; error: Error | null }> {
    try {
      return { payload: await this.fetchChart(varietyId, provinceCode), error: null };
    } catch (error) {
      return { payload: null, error: error as Error };
    }
  }

  private async fetchJson(url: string, init: RequestInit): Promise<unknown> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
    try {
      const response = await this.fetchFn(url, { ...init, signal: controller.signal });
      if (!response.ok) throw new ToolError("PROVIDER_UNAVAILABLE", `农业农村部逐市场接口返回 HTTP ${response.status}`);
      return await response.json();
    } catch (error) {
      if (error instanceof ToolError) throw error;
      if ((error as Error).name === "AbortError") {
        throw new ToolError("TIMEOUT", `农业农村部逐市场接口超时（${TIMEOUT_MS}ms）`);
      }
      throw new ToolError("PROVIDER_UNAVAILABLE", `农业农村部逐市场接口不可用: ${(error as Error).message}`);
    } finally {
      clearTimeout(timer);
    }
  }

  private headers(contentType?: string): Record<string, string> {
    return {
      ...(contentType ? { "content-type": contentType } : {}),
      referer: `${BASE_URL}/quotationIndex`,
      "user-agent": "what2eat-mcp/0.1",
    };
  }
}

export function decryptPayload(value: string, key = PUBLIC_TRANSPORT_KEY): string {
  if (value.length <= 16) throw new Error("密文长度不足");
  const decipher = createDecipheriv("aes-256-cbc", Buffer.from(key, "utf8"), Buffer.from(value.slice(0, 16), "utf8"));
  return Buffer.concat([decipher.update(Buffer.from(value.slice(16), "base64")), decipher.final()]).toString("utf8");
}

function quantile(sorted: number[], q: number): number {
  const position = (sorted.length - 1) * q;
  const base = Math.floor(position);
  const rest = position - base;
  const next = sorted[base + 1];
  return next == null ? sorted[base]! : sorted[base]! + rest * (next - sorted[base]!);
}

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

async function mapLimit<T, R>(items: T[], concurrency: number, worker: (item: T) => Promise<R>): Promise<R[]> {
  const results = new Array<R>(items.length);
  let cursor = 0;
  async function run(): Promise<void> {
    while (cursor < items.length) {
      const index = cursor++;
      results[index] = await worker(items[index]!);
    }
  }
  await Promise.all(Array.from({ length: Math.min(concurrency, items.length) }, () => run()));
  return results;
}
