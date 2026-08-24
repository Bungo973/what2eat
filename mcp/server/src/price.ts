import { join } from "node:path";
import {
  BenchmarkProvider,
  PfscMarketProvider,
  PfscProvider,
  PriceCache,
  QuoteService,
  ReferenceBenchmarkProvider,
  XinfadiProvider,
  type XinfadiQueryConfig,
  type PfscMarketQueryConfig,
  type QuoteRequest,
} from "@what2eat/price-providers";
import type { ServiceContext } from "./context.ts";

export interface PriceStack {
  service: QuoteService;
  cache: PriceCache;
}

/** 构建价格能力栈：新发地(北京实时) → 基准价(北京) → 全国参考；含分类目 TTL 缓存。 */
export function buildPriceStack(context: ServiceContext): PriceStack {
  const cache = new PriceCache();
  const resolveXinfadiQuery = (ingredientId: string): XinfadiQueryConfig | null => {
    const cat = context.catalog.byIdentifier(ingredientId);
    if (!cat) return null;
    const entry = cat.price_query_terms.find((t) => t.source === "xinfadi");
    if (!entry) return null;
    return entry.preferred_specs
      ? { terms: entry.terms, preferred_specs: entry.preferred_specs }
      : { terms: entry.terms };
  };
  const resolvePfscMarketQuery = (ingredientId: string): PfscMarketQueryConfig | null => {
    const cat = context.catalog.byIdentifier(ingredientId);
    if (!cat) return null;
    const entry = cat.price_query_terms.find((term) => term.source === "pfsc" && term.external_id);
    return entry?.external_id ? { external_id: entry.external_id, terms: entry.terms } : null;
  };
  const service = new QuoteService(
    [
      new XinfadiProvider(resolveXinfadiQuery),
      new PfscMarketProvider(resolvePfscMarketQuery),
      new BenchmarkProvider(join(context.knowledgeDir, "prices")),
      new PfscProvider(),
      new ReferenceBenchmarkProvider(join(context.knowledgeDir, "prices"), "北京"),
    ],
    cache,
    context.catalog,
  );
  return { service, cache };
}

/** quote_ingredient_prices 工具实现：参数已在工具层按 specs 校验。 */
export function makePriceHandler(context: ServiceContext): (args: Record<string, unknown>) => Promise<unknown> {
  const { service } = buildPriceStack(context);
  return async (args) => service.quote(normalizePriceRequest(args));
}

/** 把工具参数归一化为领域请求；缺省地区稳定地解释为全国参考。 */
export function normalizePriceRequest(args: Record<string, unknown>): QuoteRequest {
  return {
    region: args.region == null ? "全国" : String(args.region),
    ingredients: (args.ingredients as Array<Record<string, unknown>>).map((i) => ({
      ingredient: String(i.ingredient),
      quantity: i.quantity == null ? null : Number(i.quantity),
      unit: i.unit == null ? null : String(i.unit),
    })),
    channel: args.channel == null ? null : String(args.channel),
    max_age_hours: args.max_age_hours == null ? null : Number(args.max_age_hours),
    allow_national_fallback:
      args.allow_national_fallback == null ? true : Boolean(args.allow_national_fallback),
  };
}
