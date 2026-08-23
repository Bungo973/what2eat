import { ToolError } from "@what2eat/recipe-domain";
import type { PriceProvider, ProviderQuote, ProviderQueryItem } from "./types.ts";

export type PfscFetchFn = (url: string, init: RequestInit) => Promise<Response>;

const ENDPOINT = "https://pfsc.agri.cn/api/FarmDaily/list";
const TIMEOUT_MS = 8000;

/** pfsc 结论文本中固定品种的名称 → 食材目录 ID 映射（spike 验证的九个全国日均价品种）。 */
const PFSC_ITEM_MAP: Array<{ ingredientId: string; pfscName: string; unit: "公斤" }> = [
  { ingredientId: "pork_belly", pfscName: "猪肉", unit: "公斤" },
  { ingredientId: "beef_brisket", pfscName: "牛肉", unit: "公斤" },
  { ingredientId: "egg", pfscName: "鸡蛋", unit: "公斤" },
];

interface FarmDailyRecord {
  animalConclusion?: string;
  aquaticConclusion?: string;
  daylyDate?: string;
  createDate?: string;
}

/** 解析结论文本中的单个品种价格，如 "猪肉平均价格为16.18元/公斤"。 */
export function parseConclusionPrice(
  text: string | undefined,
  pfscName: string,
): number | null {
  if (!text) return null;
  const re = new RegExp(`${pfscName}(?:平均价格为?)?([0-9.]+)元/公斤`);
  const match = re.exec(text);
  if (!match) return null;
  const value = Number(match[1]);
  return Number.isFinite(value) ? value : null;
}

/**
 * 农业农村部全国批发均价 provider（spike 验证：POST JSON、结论文本、元/公斤、滞后 1-2 天）。
 * 作为区域价失败时的全国参考兜底，报价披露 region 为「全国」。
 */
export class PfscProvider implements PriceProvider {
  readonly name = "pfsc";

  constructor(
    private readonly fetchFn: PfscFetchFn = fetch,
    private readonly endpoint = ENDPOINT,
  ) {}

  supports(region: string): boolean {
    void region;
    return true;
  }

  async quote(items: ProviderQueryItem[], region: string): Promise<ProviderQuote[]> {
    void region;
    const wanted = new Set(items.map((i) => i.ingredient_id));
    const records = await this.fetchLatest();
    if (records.length === 0) {
      throw new ToolError("PROVIDER_UNAVAILABLE", "农业农村部接口无数据");
    }
    const latest = records[0]!;
    const date = (latest.daylyDate ?? latest.createDate ?? "").slice(0, 10);
    const out: ProviderQuote[] = [];
    for (const mapping of PFSC_ITEM_MAP) {
      if (!wanted.has(mapping.ingredientId)) continue;
      const item = items.find((i) => i.ingredient_id === mapping.ingredientId)!;
      const avg = parseConclusionPrice(latest.animalConclusion, mapping.pfscName);
      if (avg == null) continue;
      // 结论文本只给均价，按 ±5% 构造保守区间并明确披露
      const low = Math.round(avg * 0.95 * 100) / 100;
      const high = Math.round(avg * 1.05 * 100) / 100;
      out.push({
        ingredient_id: mapping.ingredientId,
        name: item.name,
        unit: "公斤",
        unit_price: { low, high },
        currency: "CNY",
        region: "全国",
        merchant: "全国农产品批发市场价格信息系统",
        source: { type: "realtime", name: "pfsc.agri.cn", url: this.endpoint },
        data_time: date || null,
        confidence: "low",
        warnings: ["全国平均价（非城市价），由均价按 ±5% 构造区间，滞后约 1-2 天"],
      });
    }
    return out;
  }

  private async fetchLatest(): Promise<FarmDailyRecord[]> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
    try {
      const res = await this.fetchFn(this.endpoint, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          referer: "https://pfsc.agri.cn/",
          "user-agent": "what2eat-mcp/0.1",
        },
        body: JSON.stringify({ limit: 3, current: 1 }),
        signal: controller.signal,
      });
      if (!res.ok) {
        throw new ToolError("PROVIDER_UNAVAILABLE", `农业农村部接口返回 HTTP ${res.status}`);
      }
      const data = (await res.json()) as { content?: { list?: FarmDailyRecord[] } };
      return data.content?.list ?? [];
    } catch (e) {
      if (e instanceof ToolError) throw e;
      if ((e as Error).name === "AbortError") {
        throw new ToolError("TIMEOUT", `农业农村部接口超时（${TIMEOUT_MS}ms）`);
      }
      throw new ToolError("PROVIDER_UNAVAILABLE", `农业农村部接口不可用: ${(e as Error).message}`);
    } finally {
      clearTimeout(timer);
    }
  }
}
