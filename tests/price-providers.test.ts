import { describe, expect, it } from "vitest";
import { createCipheriv } from "node:crypto";
import { ToolError, CatalogIndex, validateToolOutput } from "@what2eat/recipe-domain";
import { KnowledgeRepo, defaultKnowledgeDir, type ToolName } from "@what2eat/recipe-domain";
import {
  BenchmarkProvider,
  PfscMarketProvider,
  PfscProvider,
  PriceCache,
  QuoteService,
  ReferenceBenchmarkProvider,
  XinfadiProvider,
  resolveProvince,
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

function encryptPfscPayload(data: unknown): string {
  const iv = "0123456789abcdef";
  const cipher = createCipheriv(
    "aes-256-cbc",
    Buffer.from("7s9K$pG2xQ8zR5mB7vA3sD9fH2jW40cV", "utf8"),
    Buffer.from(iv, "utf8"),
  );
  return iv + Buffer.concat([cipher.update(JSON.stringify(data), "utf8"), cipher.final()]).toString("base64");
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

describe("PfscMarketProvider 省级聚合", () => {
  const regions = [
    { id: "310000", name: "上海市", shortName: "上海", pid: "0" },
    { id: "320000", name: "江苏省", shortName: "江苏", pid: "0" },
    { id: "320500", name: "苏州市", shortName: "苏州", pid: "320000" },
  ];

  it("城市名称解析到所属省份，歧义时不猜测", () => {
    expect(resolveProvince("苏州", regions)).toMatchObject({ province_code: "320000", province_name: "江苏省" });
    expect(resolveProvince("上海市", regions)).toMatchObject({ province_code: "310000", province_name: "上海市" });
  });

  it("优先返回省级多市场区间，缺省级报价时明确回退全国", async () => {
    const fetchFn = async (url: string) => {
      if (url.includes("/region/selectList")) return jsonResponse({ code: 0, data: regions });
      const parsed = new URL(url);
      const province = parsed.searchParams.get("provinceCodes");
      const variety = parsed.searchParams.get("varietyID");
      if (province === "310000" && variety === "135") {
        return jsonResponse({ code: 0, data: encryptPfscPayload({ date: "2026-08-24", x: ["市场甲", "市场乙"], y: [2.2, 3.1] }) });
      }
      if (province === "310000" && variety === "972") {
        return jsonResponse({ code: 0, data: encryptPfscPayload({ date: "2026-08-24", x: [], y: [] }) });
      }
      if (province === "" && variety === "972") {
        return jsonResponse({ code: 0, data: encryptPfscPayload({ date: "2026-08-24", x: ["甲", "乙", "丙", "丁"], y: [10, 11, 12, 13] }) });
      }
      return jsonResponse({ code: 0, data: encryptPfscPayload({ date: "2026-08-24", x: [], y: [] }) });
    };
    const provider = new PfscMarketProvider(
      (id) =>
        id === "tomato"
          ? { external_id: "135", terms: ["西红柿"] }
          : id === "egg"
            ? { external_id: "972", terms: ["鸡蛋"] }
            : null,
      fetchFn,
    );
    const quotes = await provider.quote(
      [
        { ingredient_id: "tomato", name: "番茄" },
        { ingredient_id: "egg", name: "鸡蛋" },
      ],
      "上海",
    );
    expect(quotes.find((quote) => quote.ingredient_id === "tomato")).toMatchObject({
      region: "上海市",
      region_code: "310000",
      region_scope: "province",
      region_match: true,
      market_count: 2,
      unit_price: { low: 2.2, high: 3.1 },
    });
    expect(quotes.find((quote) => quote.ingredient_id === "egg")).toMatchObject({
      region: "全国",
      region_scope: "national",
      region_match: false,
      is_fallback: true,
      market_count: 4,
      unit_price: { low: 10.75, high: 12.25 },
    });
  });

  it("allow_national_fallback=false 时不返回全国报价", async () => {
    const fetchFn = async (url: string) => {
      if (url.includes("/region/selectList")) return jsonResponse({ code: 0, data: regions });
      return jsonResponse({ code: 0, data: encryptPfscPayload({ date: "2026-08-24", x: [], y: [] }) });
    };
    const provider = new PfscMarketProvider(
      () => ({ external_id: "972", terms: ["鸡蛋"] }),
      fetchFn,
    );
    await expect(
      provider.quote([{ ingredient_id: "egg", name: "鸡蛋" }], "上海", { allow_national_fallback: false }),
    ).resolves.toEqual([]);
  });

  it("单个品种接口失败不丢弃同批次其他成功报价", async () => {
    const fetchFn = async (url: string) => {
      const variety = new URL(url).searchParams.get("varietyID");
      if (variety === "135") return new Response("upstream error", { status: 500 });
      return jsonResponse({
        code: 0,
        data: encryptPfscPayload({ date: "2026-08-24", x: ["市场甲"], y: [2.1] }),
      });
    };
    const provider = new PfscMarketProvider(
      (id) =>
        id === "tomato"
          ? { external_id: "135", terms: ["西红柿"] }
          : { external_id: "101", terms: ["土豆"] },
      fetchFn,
    );
    const quotes = await provider.quote(
      [
        { ingredient_id: "tomato", name: "番茄" },
        { ingredient_id: "potato", name: "土豆" },
      ],
      "上海",
      { allow_national_fallback: false },
    );
    expect(quotes.map((quote) => quote.ingredient_id)).toEqual(["potato"]);
  });
});

describe("QuoteService 降级链与缓存", () => {
  it("跨地区维护者基准补齐包装品参考价，且本地-only 请求不会命中其缓存", async () => {
    const cache = new PriceCache();
    const service = new QuoteService(
      [new ReferenceBenchmarkProvider(`${defaultKnowledgeDir()}/prices`, "北京")],
      cache,
      catalog,
    );
    const reference = await service.quote({
      region: "上海",
      ingredients: [{ ingredient: "milk", quantity: 500, unit: "ml" }],
    });
    expect(reference.quotes[0]).toMatchObject({
      matched_region: "北京",
      region_match: false,
      is_fallback: true,
      source: { type: "benchmark" },
      total_price: { low: 5.5, high: 7 },
    });
    expect(reference.summary).toMatchObject({
      national_fallback_count: 0,
      cross_region_fallback_count: 1,
      benchmark_priced_count: 1,
      complete: false,
      budget_status: "reference_only",
    });

    const localOnly = await service.quote({
      region: "上海",
      ingredients: [{ ingredient: "milk", quantity: 500, unit: "ml" }],
      allow_national_fallback: false,
    });
    expect(localOnly.quotes).toEqual([]);
    expect(localOnly.unmatched).toHaveLength(1);
  });

  it("城市请求命中所属省份时计入省级覆盖，但不冒充城市精确价", async () => {
    const provider = {
      name: "province-fixture",
      supports: () => true,
      quote: async () => [
        {
          ingredient_id: "potato",
          name: "土豆",
          unit: "公斤",
          unit_price: { low: 2, high: 2.5 },
          currency: "CNY" as const,
          region: "江苏省",
          merchant: "江苏省批发市场聚合",
          source: { type: "realtime" as const, name: "fixture", url: null },
          data_time: "2026-08-24",
          confidence: "medium" as const,
          requested_region: "苏州",
          matched_region: "江苏省",
          region_code: "320000",
          region_scope: "province" as const,
          region_match: true,
          is_fallback: false,
          price_basis: "wholesale_observed" as const,
          budget_usable: "reference_only" as const,
        },
      ],
    };
    const service = new QuoteService([provider], new PriceCache(), catalog);
    const out = await service.quote({
      region: "苏州",
      ingredients: [{ ingredient: "potato", quantity: 500, unit: "g" }],
    });
    expect(out.summary).toMatchObject({
      exact_region_priced_count: 0,
      province_priced_count: 1,
      complete: true,
      budget_status: "reference_only",
    });
  });

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
    expect(q.requested_quantity).toEqual({ quantity: 2, unit: "斤" });
    expect(q.unit).toBe("斤");
    expect(q.unit_price.low).toBe(1.3);
    expect(q.total_price).toEqual({ low: 2.6, high: 4.2 });
    expect(out.summary).toMatchObject({
      requested_count: 1,
      quoted_count: 1,
      priced_count: 1,
      exact_region_priced_count: 1,
      budget_status: "reference_only",
      complete: true,
      priced_subtotal: { low: 2.6, high: 4.2 },
    });
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
    expect(other.summary.complete).toBe(false);
    expect(other.summary.exact_region_priced_count).toBe(0);
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
    expect(weird.summary.complete).toBe(false);
    expect(weird.warnings.some((w) => w.code === "UNIT_UNCONVERTIBLE")).toBe(true);
  });

  it("全国参考价与上海请求明确分离，数量单位不与单价单位混用", async () => {
    const fetchFn = async () =>
      jsonResponse({
        content: {
          list: [
            {
              daylyDate: "2026-08-21 00:00:00",
              animalConclusion: "鸡蛋10.68元/公斤。",
            },
          ],
        },
      });
    const service = new QuoteService([new PfscProvider(fetchFn as never)], new PriceCache(), catalog);
    const out = await service.quote({
      region: "上海",
      ingredients: [{ ingredient: "egg", quantity: 0.7, unit: "斤" }],
    });
    expect(out.quotes[0]!.requested_quantity).toEqual({ quantity: 0.7, unit: "斤" });
    expect(out.quotes[0]!.unit).toBe("公斤");
    expect(out.quotes[0]!.total_price).toEqual({ low: 3.55, high: 3.92 });
    expect(out.summary).toMatchObject({
      requested_count: 1,
      priced_count: 1,
      exact_region_priced_count: 0,
      complete: false,
    });
    expect(out.warnings.some((warning) => warning.code === "REGION_FALLBACK")).toBe(true);
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
