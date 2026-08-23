import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { buildContext } from "@what2eat/mcp-server/src/context.ts";
import { createWhat2EatServer } from "@what2eat/mcp-server/src/http.ts";
import { makePriceHandler } from "@what2eat/mcp-server/src/price.ts";

const TOKEN = "scenario-token";
let server: ReturnType<typeof createWhat2EatServer>["server"];
let baseUrl = "";
let client: Client;

async function call<T = Record<string, unknown>>(name: string, args: Record<string, unknown>): Promise<T> {
  const result = (await client.callTool({ name, arguments: args })) as {
    isError?: boolean;
    content: Array<{ text?: string }>;
  };
  if (result.isError) {
    throw new Error(`工具 ${name} 返回错误: ${result.content[0]!.text}`);
  }
  return JSON.parse(result.content[0]!.text!) as T;
}

beforeAll(async () => {
  const context = buildContext();
  const created = createWhat2EatServer({
    port: 0,
    token: TOKEN,
    priceHandler: makePriceHandler(context),
    context,
  });
  server = created.server;
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", () => resolve()));
  const address = server.address();
  const port = typeof address === "object" && address ? address.port : 0;
  baseUrl = `http://127.0.0.1:${port}`;
  client = new Client({ name: "scenario-test", version: "0.0.1" });
  await client.connect(
    new StreamableHTTPClientTransport(new URL(`${baseUrl}/mcp`), {
      requestInit: { headers: { authorization: `Bearer ${TOKEN}` } },
    }),
  );
});

afterAll(async () => {
  await client.close();
  await new Promise<void>((resolve) => server.close(() => resolve()));
});

describe("场景 1：单次菜谱查询（PRD 场景 2/3/4）", () => {
  it("搜索 → 读取完整菜谱，全程可追溯 recipe_id 与版本", async () => {
    const search = await call<{
      items: Array<{ recipe_id: string; version: number; name: string }>;
    }>("search_recipes", { query: "番茄" });
    expect(search.items.length).toBeGreaterThan(0);
    const first = search.items[0]!;

    const detail = await call<{
      recipe_id: string;
      version: number;
      raw_markdown: string;
      parsed: { name: string; ingredients: Array<{ id: string }> };
    }>("read_recipe", { recipe_id: first.recipe_id, format: "both" });
    expect(detail.recipe_id).toBe(first.recipe_id);
    expect(detail.version).toBe(first.version);
    expect(detail.raw_markdown).toContain("## 做法");
    expect(detail.parsed.ingredients.some((i) => i.id === "tomato")).toBe(true);
  });
});

describe("场景 2：五天晚餐周期规划（PRD 场景 5/6/7）", () => {
  it("硬约束检索 → 编排 → 采购汇总 → 方案校验 → 基准估价", async () => {
    // 1) 过敏原（蛋）+ 时长硬过滤检索
    const search = await call<{
      items: Array<{ recipe_id: string; version: number; total_minutes: number }>;
    }>("search_recipes", {
      meal_types: ["dinner"],
      exclude_allergens: ["egg"],
      max_total_minutes: 45,
      limit: 20,
    });
    const candidates = search.items;
    expect(candidates.length).toBeGreaterThanOrEqual(5);
    expect(candidates.every((c) => c.total_minutes <= 45)).toBe(true);

    // 2) Agent 编排五天晚餐（模拟 Agent 选择，不使用生成型工具）
    const dates = ["2026-08-24", "2026-08-25", "2026-08-26", "2026-08-27", "2026-08-28"];
    const plan = dates.map((date, i) => ({
      date,
      meal_type: "dinner" as const,
      recipe_id: candidates[i]!.recipe_id,
      version: candidates[i]!.version,
      servings: 2,
    }));

    // 3) 采购汇总
    const shopping = await call<{
      groups: Array<{ category: string; items: Array<{ ingredient_id: string | null; used_in: Array<{ recipe_id: string }> }> }>;
      warnings: Array<{ code: string }>;
    }>("aggregate_shopping_list", { items: plan });
    const allItems = shopping.groups.flatMap((g) => g.items);
    expect(allItems.length).toBeGreaterThan(5);
    // 非精确量必须产生警告（调味料按口味添加）
    expect(shopping.warnings.some((w) => w.code === "NON_QUANTIFIED")).toBe(true);

    // 4) 方案校验：范围完整 + 硬约束
    const validation = await call<{ errors: Array<{ code: string }>; assumptions: string[] }>(
      "validate_meal_plan",
      {
        meals: plan,
        expected_scope: { dates, meal_types: ["dinner"] },
        constraints: { exclude_allergens: ["egg"], max_cooking_minutes: 45 },
      },
    );
    expect(validation.errors).toEqual([]);

    // 5) 基准估价（benchmark 降级路径：quote 必须给出区间与来源）
    const quote = await call<{
      quotes: Array<{ ingredient_id: string; unit_price: { low: number; high: number }; source: { type: string } }>;
    }>("quote_ingredient_prices", {
      region: "北京",
      ingredients: allItems
        .filter((i) => i.ingredient_id)
        .slice(0, 5)
        .map((i) => ({ ingredient: i.ingredient_id! })),
    });
    expect(quote.quotes.length).toBeGreaterThan(0);
    for (const q of quote.quotes) {
      expect(q.unit_price.low).toBeLessThanOrEqual(q.unit_price.high);
      expect(["realtime", "cached", "benchmark"]).toContain(q.source.type);
    }
  });
});

describe("场景 3：局部换菜（PRD 场景 8）", () => {
  it("只换周三晚餐：其他餐次的采购量不受影响", async () => {
    const oldPlan = [
      { date: "2026-09-01", meal_type: "dinner", recipe_id: "tomato-eggs", servings: 2 },
      { date: "2026-09-02", meal_type: "dinner", recipe_id: "kung-pao-chicken", servings: 2 },
      { date: "2026-09-03", meal_type: "dinner", recipe_id: "garlic-broccoli", servings: 2 },
    ];
    const newPlan = oldPlan.map((m) =>
      m.date === "2026-09-03" ? { ...m, recipe_id: "steamed-sea-bass" } : m,
    );

    const agg = async (plan: typeof oldPlan) => {
      const out = await call<{
        groups: Array<{ items: Array<{ ingredient_id: string | null; to_buy: { quantity: number | null } }> }>;
      }>("aggregate_shopping_list", { items: plan });
      const map = new Map<string, number | null>();
      for (const item of out.groups.flatMap((g) => g.items)) {
        if (item.ingredient_id) map.set(item.ingredient_id, item.to_buy.quantity);
      }
      return map;
    };

    const before = await agg(oldPlan);
    const after = await agg(newPlan);

    // 未点名餐次且不受共享食材影响的项保持不变（番茄/蛋来自周一，花生/干辣椒来自周二）
    for (const id of ["tomato", "egg", "corn_peanut_mix", "dried_chili"]) {
      expect(after.get(id), `食材 ${id} 的采购量不应变化`).toBe(before.get(id));
    }
    // 大葱是共享食材（新菜清蒸鲈鱼也要葱丝），总量变化属正确的依赖影响
    expect(after.get("scallion")).not.toBe(before.get("scallion"));
    // 被换下的西兰花退出清单，换入的鲈鱼进入清单
    expect(before.has("broccoli")).toBe(true);
    expect(after.has("broccoli")).toBe(false);
    expect(after.has("sea_bass")).toBe(true);

    // 新方案仍然通过校验
    const validation = await call<{ errors: Array<{ code: string }> }>("validate_meal_plan", {
      meals: newPlan,
      expected_scope: {
        dates: ["2026-09-01", "2026-09-02", "2026-09-03"],
        meal_types: ["dinner"],
      },
    });
    expect(validation.errors).toEqual([]);
  });
});
