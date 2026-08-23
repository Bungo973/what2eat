import { describe, expect, it } from "vitest";
import { ToolError, CatalogIndex, validateToolOutput } from "@what2eat/recipe-domain";
import { KnowledgeRepo, defaultKnowledgeDir, type ToolName } from "@what2eat/recipe-domain";
import {
  BenchmarkProvider,
  PfscProvider,
  PriceCache,
  QuoteService,
  XinfadiProvider,
} from "@what2eat/price-providers";

const repo = new KnowledgeRepo(defaultKnowledgeDir());
const catalog = new CatalogIndex(repo.loadCatalog());

const XINFADI_TOMATO = {
  current: 1,
  limit: 10,
  count: 2,
  list: [
    {
      prodName: "番茄",
      prodCatid: 1186,
      prodCat: "蔬菜",
      prodPcatid: null,
      prodPcat: "",
      lowPrice: "0.8",
      highPrice: "1.3",
      avgPrice: "1.05",
      place: "冀",
      specInfo: "黑框",
      unitInfo: "斤",
      pubDate: "2026-08-23 00:00:00",
    },
    {
      prodName: "番茄",
      prodCatid: 1186,
      prodCat: "蔬菜",
      prodPcatid: null,
      prodPcat: "",
      lowPrice: "0.7",
      highPrice: "1.1",
      avgPrice: "0.9",
      place: "冀",
      specInfo: "",
      unitInfo: "斤",
      pubDate: "2026-08-22 00:00:00",
    },
  ],
};

const XINFADI_PORK = {
  current: 1,
  limit: 10,
  count: 3,
  list: [
    {
      prodName: "五花肉",
      prodCatid: 1189,
      prodCat: "肉禽蛋",
      prodPcatid: 1205,
      prodPcat: "猪肉类",
      lowPrice: "9.0",
      highPrice: "9.5",
      avgPrice: "9.25",
      place: "",
      specInfo: "瘦",
      unitInfo: "斤",
      pubDate: "2026-08-23 00:00:00",
    },
    {
      prodName: "五花肉",
      prodCatid: 1189,
      prodCat: "肉禽蛋",
      prodPcatid: 1205,
      prodPcat: "猪肉类",
      lowPrice: "8.0",
      highPrice: "8.5",
      avgPrice: "8.25",
      place: "",
      specInfo: "肥",
      unitInfo: "斤",
      pubDate: "2026-08-23 00:00:00",
    },
  ],
};

function jsonResponse(data: unknown): Response {
  return new Response(JSON.stringify(data), { status: 200 });
}

function makeXinfadi(map: Record<string, unknown>, throws = false): XinfadiProvider {
  const resolve = (id: string) => {
    const cat = catalog.byIdentifier(id);
    const entry = cat?.price_query_terms.find((t) => t.source === "xinfadi");
    return entry ? { terms: entry.terms, preferred_specs: entry.preferred_specs } : null;
  };
  const fetchFn = async () => {
    if (throws) throw new Error("network down");
    for (const value of Object.values(map)) return jsonResponse(value);
    return jsonResponse({ list: [] });
  };
  return new XinfadiProvider(resolve, fetchFn as never);
}

describe("XinfadiProvider", () => {
  it("取最新日期并返回区间（fixture 回放）", async () => {
    const provider = makeXinfadi({ 番茄: XINFADI_TOMATO });
    const quotes = await provider.quote(
      [{ ingredient_id: "tomato", name: "番茄" }],
      "北京",
    );
    expect(quotes).toHaveLength(1);
    const q = quotes[0]!;
    expect(q.unit).toBe("斤");
    expect(q.unit_price).toEqual({ low: 0.8, high: 1.3 });
    expect(q.source.type).toBe("realtime");
    expect(q.data_time).toContain("2026-08-23");
  });

  it("preferred_specs 过滤生效：五花肉瘦规格", async () => {
    const provider = makeXinfadi({ 五花肉: XINFADI_PORK });
    const quotes = await provider.quote(
      [{ ingredient_id: "pork_belly", name: "五花肉" }],
      "北京",
    );
    expect(quotes[0]!.unit_price).toEqual({ low: 9.0, high: 9.5 });
  });

  it("网络故障返回 PROVIDER_UNAVAILABLE", async () => {
    const provider = makeXinfadi({}, true);
    await expect(
      provider.quote([{ ingredient_id: "tomato", name: "番茄" }], "北京"),
    ).rejects.toMatchObject({ code: "PROVIDER_UNAVAILABLE" });
  });

  it("仅支持北京", () => {
    const provider = makeXinfadi({});
    expect(provider.supports("北京")).toBe(true);
    expect(provider.supports("上海")).toBe(false);
  });
});

describe("PfscProvider", () => {
  it("解析结论文本为全国均价区间（±5%）", async () => {
    const fetchFn = async () =>
      jsonResponse({
        code: 200,
        content: {
          list: [
            {
              daylyDate: "2026-08-21 00:00:00",
              animalConclusion:
                "猪肉平均价格为16.18元/公斤，比昨天上升0.3%；牛肉68.69元/公斤；鸡蛋10.68元/公斤。",
            },
          ],
        },
      });
    const provider = new PfscProvider(fetchFn as never);
    const quotes = await provider.quote(
      [
        { ingredient_id: "pork_belly", name: "五花肉" },
        { ingredient_id: "egg", name: "鸡蛋" },
      ],
      "北京",
    );
    expect(quotes).toHaveLength(2);
    const pork = quotes.find((q) => q.ingredient_id === "pork_belly")!;
    expect(pork.unit).toBe("公斤");
    expect(pork.unit_price.low).toBeCloseTo(16.18 * 0.95, 2);
    expect(pork.region).toBe("全国");
    expect(pork.confidence).toBe("low");
  });
});

describe("QuoteService 降级链与缓存", () => {
  it("实时失败 → 基准价兜底，并产生降级警告", async () => {
    const cache = new PriceCache();
    const service = new QuoteService(
      [makeXinfadi({}, true), new BenchmarkProvider(`${defaultKnowledgeDir()}/prices`)],
      cache,
      catalog,
    );
    const out = await service.quote({
      region: "北京",
      ingredients: [{ ingredient: "tomato", quantity: 2, unit: "斤" }],
    });
    expect(out.quotes).toHaveLength(1);
    const q = out.quotes[0]!;
    expect(q.source.type).toBe("benchmark");
    expect(q.unit_price.low).toBe(1.3);
    expect(q.total_price).toEqual({ low: 2.6, high: 4.2 });
    expect(out.warnings.some((w) => w.code === "PROVIDER_DEGRADED")).toBe(true);
    const check = validateToolOutput("quote_ingredient_prices" as ToolName, out);
    expect(check.ok, check.ok ? "" : check.message).toBe(true);
  });

  it("第二次调用命中缓存且数据类型变为 cached", async () => {
    const cache = new PriceCache();
    const provider = makeXinfadi({ 番茄: XINFADI_TOMATO });
    const service = new QuoteService([provider], cache, catalog);
    const first = await service.quote({
      region: "北京",
      ingredients: [{ ingredient: "番茄", quantity: 500, unit: "g" }],
    });
    expect(first.quotes[0]!.source.type).toBe("realtime");
    expect(first.quotes[0]!.total_price).toEqual({ low: 0.8, high: 1.3 });
    const second = await service.quote({
      region: "北京",
      ingredients: [{ ingredient: "西红柿" }],
    });
    expect(second.quotes[0]!.source.type).toBe("cached");
    expect(cache.hits).toBe(1);
  });

  it("未收录食材进入 unmatched；非北京地区退到基准价或全国参考", async () => {
    const cache = new PriceCache();
    const service = new QuoteService(
      [makeXinfadi({}), new BenchmarkProvider(`${defaultKnowledgeDir()}/prices`)],
      cache,
      catalog,
    );
    const out = await service.quote({
      region: "北京",
      ingredients: [{ ingredient: "不存在的食材" }],
    });
    expect(out.quotes).toEqual([]);
    expect(out.unmatched[0]!.reason).toContain("标准食材目录");

    const other = await service.quote({
      region: "上海",
      ingredients: [{ ingredient: "tomato" }],
    });
    expect(other.unmatched[0]!.reason).toContain("无该食材数据");
  });

  it("ml 报价与 g 请求量纲不同时不伪造总价", async () => {
    const cache = new PriceCache();
    const service = new QuoteService(
      [new BenchmarkProvider(`${defaultKnowledgeDir()}/prices`)],
      cache,
      catalog,
    );
    const out = await service.quote({
      region: "北京",
      ingredients: [{ ingredient: "milk", quantity: 200, unit: "ml" }],
    });
    const milk = out.quotes.find((q) => q.ingredient_id === "milk")!;
    expect(milk.total_price!.low).toBeCloseTo(200 * 0.011, 2);
    const weird = await service.quote({
      region: "北京",
      ingredients: [{ ingredient: "tomato", quantity: 200, unit: "ml" }],
    });
    const tomato = weird.quotes.find((q) => q.ingredient_id === "tomato")!;
    expect(tomato.total_price).toBeNull();
    expect(weird.warnings.some((w) => w.code === "UNIT_UNCONVERTIBLE")).toBe(true);
  });

  it("时效要求超龄时下调可信度并警告", async () => {
    const cache = new PriceCache();
    const service = new QuoteService(
      [new BenchmarkProvider(`${defaultKnowledgeDir()}/prices`)],
      cache,
      catalog,
    );
    const out = await service.quote({
      region: "北京",
      ingredients: [{ ingredient: "tomato" }],
      max_age_hours: 1,
    });
    expect(out.quotes[0]!.confidence).toBe("low");
    expect(out.warnings.some((w) => w.code === "STALE_PRICE")).toBe(true);
  });
});
