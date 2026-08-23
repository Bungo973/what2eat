import { ToolError } from "@what2eat/recipe-domain";
import type { PriceProvider, ProviderQuote, ProviderQueryItem } from "./types.ts";

export interface XinfadiQueryConfig {
  terms: string[];
  preferred_specs?: string[];
}

export type FetchFn = (url: string, init: RequestInit) => Promise<Response>;

interface XinfadiRow {
  prodName: string;
  prodCat: string;
  lowPrice: string;
  highPrice: string;
  avgPrice: string;
  place: string;
  specInfo: string;
  unitInfo: string;
  pubDate: string;
}

const DEFAULT_ENDPOINT = "http://www.xinfadi.com.cn/getPriceData.html";
const TIMEOUT_MS = 8000;

/**
 * 北京新发地批发价 provider（spike 已验证：POST form、无鉴权、日更、元/斤、天然区间）。
 * 服务端日期过滤参数已失效，取默认最新排序后客户端过滤最新 pubDate。
 */
export class XinfadiProvider implements PriceProvider {
  readonly name = "xinfadi";

  constructor(
    private readonly resolveQuery: (ingredientId: string) => XinfadiQueryConfig | null,
    private readonly fetchFn: FetchFn = fetch,
    private readonly endpoint = DEFAULT_ENDPOINT,
  ) {}

  supports(region: string): boolean {
    return region === "北京";
  }

  async quote(items: ProviderQueryItem[], region: string): Promise<ProviderQuote[]> {
    const out: ProviderQuote[] = [];
    for (const item of items) {
      const config = this.resolveQuery(item.ingredient_id);
      if (!config || config.terms.length === 0) continue;
      const quote = await this.quoteOne(item, config, region);
      if (quote) out.push(quote);
    }
    return out;
  }

  private async quoteOne(
    item: ProviderQueryItem,
    config: XinfadiQueryConfig,
    region: string,
  ): Promise<ProviderQuote | null> {
    for (const term of config.terms) {
      const rows = await this.fetchRows(term);
      if (rows.length === 0) continue;
      const newest = rows
        .map((r) => r.pubDate)
        .sort()
        .at(-1)!;
      let candidates = rows.filter((r) => r.pubDate === newest);
      if (config.preferred_specs?.length) {
        const preferred = candidates.filter((r) =>
          config.preferred_specs!.some((s) => r.specInfo.includes(s)),
        );
        if (preferred.length > 0) candidates = preferred;
      }
      const byJin = candidates.filter((r) => r.unitInfo === "斤");
      if (byJin.length > 0) candidates = byJin;
      if (candidates.length === 0) continue;
      const low = Math.min(...candidates.map((r) => Number(r.lowPrice)));
      const high = Math.max(...candidates.map((r) => Number(r.highPrice)));
      if (!Number.isFinite(low) || !Number.isFinite(high) || low <= 0 || high <= 0) continue;
      return {
        ingredient_id: item.ingredient_id,
        name: item.name,
        unit: "斤",
        unit_price: { low, high },
        currency: "CNY",
        region,
        merchant: "北京新发地批发市场",
        source: { type: "realtime", name: "xinfadi", url: this.endpoint },
        data_time: newest.replace(" ", "T") + (newest.includes("+") ? "" : "+08:00"),
        confidence: "medium",
        warnings: ["批发价口径（新发地当日），未含零售加价"],
      };
    }
    return null;
  }

  private async fetchRows(term: string): Promise<XinfadiRow[]> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
    try {
      const body = new URLSearchParams({ limit: "10", current: "1", prodName: term });
      const res = await this.fetchFn(this.endpoint, {
        method: "POST",
        headers: { "content-type": "application/x-www-form-urlencoded" },
        body: body.toString(),
        signal: controller.signal,
      });
      if (!res.ok) {
        throw new ToolError("PROVIDER_UNAVAILABLE", `新发地接口返回 HTTP ${res.status}`);
      }
      const data = (await res.json()) as { list?: XinfadiRow[] };
      return data.list ?? [];
    } catch (e) {
      if (e instanceof ToolError) throw e;
      if ((e as Error).name === "AbortError") {
        throw new ToolError("TIMEOUT", `新发地接口超时（${TIMEOUT_MS}ms）`);
      }
      throw new ToolError("PROVIDER_UNAVAILABLE", `新发地接口不可用: ${(e as Error).message}`);
    } finally {
      clearTimeout(timer);
    }
  }
}
