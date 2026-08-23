import { join } from "node:path";
import {
  BenchmarkProvider,
  PfscProvider,
  PriceCache,
  QuoteService,
  XinfadiProvider,
  type XinfadiQueryConfig,
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
    return { terms: entry.terms, preferred_specs: entry.preferred_specs };
  };
  const service = new QuoteService(
    [
      new XinfadiProvider(resolveXinfadiQuery),
      new BenchmarkProvider(join(context.knowledgeDir, "prices")),
      new PfscProvider(),
    ],
    cache,
    context.catalog,
  );
  return { service, cache };
}

/** quote_ingredient_prices 工具实现：参数已在工具层按 specs 校验。 */
export function makePriceHandler(context: ServiceContext): (args: Record<string, unknown>) => Promise<unknown> {
  const { service } = buildPriceStack(context);
  return async (args) => {
    const region = String(args.region);
    const ingredients = (args.ingredients as Array<Record<string, unknown>>).map((i) => ({
      ingredient: String(i.ingredient),
      quantity: i.quantity == null ? null : Number(i.quantity),
      unit: i.unit == null ? null : String(i.unit),
    }));
    const channel = args.channel == null ? null : String(args.channel);
    const maxAge = args.max_age_hours == null ? null : Number(args.max_age_hours);
    return service.quote({ region, ingredients, channel, max_age_hours: maxAge });
  };
}
