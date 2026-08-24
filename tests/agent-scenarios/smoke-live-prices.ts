import { CatalogIndex, KnowledgeRepo, defaultKnowledgeDir } from "@what2eat/recipe-domain";
import { BenchmarkProvider, PfscMarketProvider, PfscProvider, XinfadiProvider } from "@what2eat/price-providers";
import { join } from "node:path";

const repo = new KnowledgeRepo(defaultKnowledgeDir());
const catalog = new CatalogIndex(repo.loadCatalog());

const resolveXinfadi = (id: string) => {
  const cat = catalog.byIdentifier(id);
  const entry = cat?.price_query_terms.find((t) => t.source === "xinfadi");
  return entry ? { terms: entry.terms, preferred_specs: entry.preferred_specs } : null;
};

const resolvePfscMarket = (id: string) => {
  const cat = catalog.byIdentifier(id);
  const entry = cat?.price_query_terms.find((term) => term.source === "pfsc" && term.external_id);
  return entry?.external_id ? { external_id: entry.external_id, terms: entry.terms } : null;
};

const items = [
  { ingredient_id: "tomato", name: "番茄" },
  { ingredient_id: "potato", name: "土豆" },
  { ingredient_id: "cucumber", name: "黄瓜" },
  { ingredient_id: "egg", name: "鸡蛋" },
];

async function main(): Promise<void> {
  console.log("=== 新发地（北京实时） ===");
  try {
    const provider = new XinfadiProvider(resolveXinfadi);
    for (const q of await provider.quote(items, "北京")) {
      console.log(
        `${q.name}: ${q.unit_price.low}-${q.unit_price.high} 元/${q.unit} @ ${q.data_time} [${q.confidence}]`,
      );
    }
  } catch (e) {
    console.log("失败:", (e as Error).message);
  }

  console.log("=== 农业农村部逐市场报价（上海省级 → 全国回退） ===");
  try {
    const provider = new PfscMarketProvider(resolvePfscMarket);
    for (const q of await provider.quote(items, "上海")) {
      console.log(
        `${q.name}: ${q.unit_price.low}-${q.unit_price.high} 元/${q.unit} @ ${q.data_time} ` +
          `[${q.region_scope}:${q.region}, markets=${q.market_count}, fallback=${q.is_fallback}]`,
      );
    }
  } catch (e) {
    console.log("失败:", (e as Error).message);
  }

  console.log("=== 农业农村部（全国参考） ===");
  try {
    const provider = new PfscProvider();
    for (const q of await provider.quote(items, "北京")) {
      console.log(
        `${q.name}: ${q.unit_price.low}-${q.unit_price.high} 元/${q.unit} @ ${q.data_time} [${q.confidence}]`,
      );
    }
  } catch (e) {
    console.log("失败:", (e as Error).message);
  }

  console.log("=== 基准价（benchmark） ===");
  const bench = new BenchmarkProvider(join(defaultKnowledgeDir(), "prices"));
  for (const q of await bench.quote(items, "北京")) {
    console.log(
      `${q.name}: ${q.unit_price.low}-${q.unit_price.high} 元/${q.unit} @ ${q.data_time} [${q.confidence}]`,
    );
  }
}

void main();
