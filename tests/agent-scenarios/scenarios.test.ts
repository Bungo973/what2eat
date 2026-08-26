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

    // 最终餐单的每道菜都必须有目标份数食材和正文做法，不能只依赖搜索摘要。
    for (const meal of plan) {
      const detail = await call<{
        raw_markdown: string;
        scaled_ingredients: Array<{ id: string; quantity: number | null; unit: string | null }>;
      }>("read_recipe", {
        recipe_id: meal.recipe_id,
        version: meal.version,
        servings: meal.servings,
        format: "both",
      });
      expect(detail.raw_markdown).toContain("## 做法");
      expect(detail.scaled_ingredients.length).toBeGreaterThan(0);
    }

    // 3) 采购汇总
    const shopping = await call<{
      groups: Array<{
        category: string;
        items: Array<{
          ingredient_id: string | null;
          to_buy: { quantity: number | null; unit: string | null };
          used_in: Array<{ recipe_id: string }>;
        }>;
      }>;
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
    const priceInputs = allItems
      .filter(
        (i) =>
          i.ingredient_id !== null &&
          i.to_buy.quantity !== null &&
          i.to_buy.quantity > 0 &&
          i.to_buy.unit !== null,
      )
      .slice(0, 5)
      .map((i) => ({
        ingredient: i.ingredient_id!,
        quantity: i.to_buy.quantity!,
        unit: i.to_buy.unit!,
      }));
    expect(priceInputs.length).toBeGreaterThan(0);

    const quote = await call<{
      quotes: Array<{
        ingredient_id: string;
        requested_quantity: { quantity: number; unit: string } | null;
        unit_price: { low: number; high: number };
        total_price: { low: number; high: number } | null;
        source: { type: string };
      }>;
      summary: {
        requested_count: number;
        priced_count: number;
        exact_region_priced_count: number;
        province_priced_count: number;
        national_fallback_count: number;
        cross_region_fallback_count: number;
        budget_status: "verified" | "reference_only" | "incomplete";
        complete: boolean;
        priced_subtotal: { low: number; high: number } | null;
      };
    }>("quote_ingredient_prices", {
      region: "北京",
      channel: "supermarket",
      ingredients: priceInputs,
    });
    expect(quote.quotes.length).toBeGreaterThan(0);
    for (const q of quote.quotes) {
      expect(q.requested_quantity).not.toBeNull();
      expect(q.unit_price.low).toBeLessThanOrEqual(q.unit_price.high);
      expect(q.total_price).not.toBeNull();
      expect(q.total_price!.low).toBeLessThanOrEqual(q.total_price!.high);
      expect(["realtime", "cached", "benchmark"]).toContain(q.source.type);
    }
    expect(quote.summary.requested_count).toBe(priceInputs.length);
    expect(quote.summary.priced_count).toBe(quote.quotes.length);
    expect(quote.summary.exact_region_priced_count).toBe(quote.quotes.length);
    expect(quote.summary.province_priced_count).toBe(quote.quotes.length);
    expect(quote.summary.national_fallback_count).toBe(0);
    expect(quote.summary.cross_region_fallback_count).toBe(0);
    expect(quote.summary.budget_status).toBe("reference_only");
    expect(quote.summary.priced_subtotal).not.toBeNull();
  });

  it("1 人份同餐多菜：缩放食材、采购换算与校验保持一致", async () => {
    const meals = [
      { date: "2026-08-24", meal_type: "dinner", recipe_id: "tomato-eggs", version: 1, servings: 1 },
      { date: "2026-08-24", meal_type: "dinner", recipe_id: "garlic-broccoli", version: 1, servings: 1 },
    ];

    const detail = await call<{
      scaled_ingredients: Array<{ id: string; quantity: number | null; unit: string | null }>;
    }>("read_recipe", { recipe_id: "tomato-eggs", version: 1, servings: 1, format: "parsed" });
    const scaledTomato = detail.scaled_ingredients.find((item) => item.id === "tomato")!;
    expect(scaledTomato).toMatchObject({ quantity: 200, unit: "g" });

    const shopping = await call<{
      groups: Array<{
        items: Array<{
          ingredient_id: string | null;
          total_required: { quantity: number | null; unit: string | null };
          to_buy: { quantity: number | null; unit: string | null };
        }>;
      }>;
    }>("aggregate_shopping_list", { items: meals });
    const tomato = shopping.groups
      .flatMap((group) => group.items)
      .find((item) => item.ingredient_id === "tomato")!;
    expect(tomato.total_required).toEqual({ quantity: 0.4, unit: "斤" });
    expect(tomato.to_buy).toEqual({ quantity: 0.4, unit: "斤" });
    expect(scaledTomato.quantity! / 500).toBe(tomato.to_buy.quantity);

    const validation = await call<{ errors: Array<{ code: string }> }>("validate_meal_plan", {
      meals,
      expected_scope: { dates: ["2026-08-24"], meal_types: ["dinner"] },
    });
    expect(validation.errors).toEqual([]);
  });
});

describe("场景 3：局部换菜（PRD 场景 8）", () => {
  it("食材买不到且没有已发布替换规则时，给出确定性整菜候选而不是假装有依据的省略建议", async () => {
    // 换菜省略类替换规则已简化为菜谱自身的 optional/notes 字段（不再是独立 substitutions/ 文件）；
    // find_replacements 现在应该诚实地报告"没有已发布替换规则"，整菜候选改由同 dish_role 的确定性检索给出。
    // 用"白糖"而不是"大葱"：番茄炒蛋现在归 dish_role: mixed，同分类仅有的另外两篇（麻婆豆腐、
    // 胡萝卜炒鸡蛋）恰好都含大葱这个点缀食材，排除大葱会把整个同分类候选池清空——这本身是
    // mixed 这种小分类的真实局限，但不是这条用例想验证的点，换一个不冲突的缺货食材。
    const result = await call<{
      substitutions: Array<{ substitution_id: string; from_ingredient: string; mode: string }>;
      recipe_alternatives: Array<{ recipe_id: string; relation_type: string }>;
      warnings: Array<{ code: string }>;
    }>("find_replacements", {
      recipe_id: "tomato-eggs",
      reason: "unavailable",
      unavailable_ingredients: ["白糖"],
      limit: 5,
    });
    expect(result.substitutions).toEqual([]);
    expect(result.warnings.some((w) => w.code === "NO_CURATED_REPLACEMENT")).toBe(true);
    expect(result.recipe_alternatives.length).toBeGreaterThan(0);
    expect(result.recipe_alternatives.every((a) => a.relation_type === "derived")).toBe(true);
  });

  it("把已确定结果渲染为包含菜单、菜谱、采购和价格表的 HTML", async () => {
    const result = await call<{ filename: string; mime_type: string; html: string; artifact_path: string }>(
      "render_meal_plan_html",
      {
        title: "今晚吃什么",
        summary: { servings: "2 人份" },
        menu: [
          {
            date: "2026-08-24",
            meal_type: "晚餐",
            dishes: [
              { name: "番茄炒蛋", recipe_id: "tomato-eggs", version: 1, servings: 2, total_minutes: 15 },
            ],
          },
        ],
        recipes: [
          {
            name: "番茄炒蛋",
            recipe_id: "tomato-eggs",
            version: 1,
            servings: 2,
            total_minutes: 15,
            ingredients: [{ name: "番茄", quantity: 400, unit: "g" }],
            steps: ["番茄切块后按菜谱炒制。"],
          },
        ],
        shopping_groups: [
          { category: "蔬菜", items: [{ name: "番茄", required: "400 g", to_buy: "400 g" }] },
        ],
        pricing: {
          requested_region: "全国",
          currency: "CNY",
          total_range: { low: 3, high: 5 },
          budget_status: "reference_only",
          coverage_summary: "全国参考 1 项",
          items: [
            {
              name: "番茄",
              quantity: "400 g",
              unit_price: "4–6 元/公斤",
              subtotal: "1.6–2.4 元",
              matched_region: "全国 / national",
              basis: "全国批发均价",
              source: "PFSC",
              confidence: "low",
            },
          ],
        },
      },
    );
    expect(result.filename).toMatch(/^meal-plan-[a-f0-9]+\.html$/);
    expect(result.mime_type).toBe("text/html; charset=utf-8");
    expect(result.html).toContain("今天吃这些");
    expect(result.html).toContain("怎么做");
    expect(result.html).toContain("要买什么");
    expect(result.html).toContain("大概花多少钱");
    expect(result.artifact_path).toContain(result.filename);
  });

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

    // 换入菜谱必须能提供完整做法，保证修改后的产物仍可直接执行。
    const replacement = await call<{ raw_markdown: string; scaled_ingredients: unknown[] }>("read_recipe", {
      recipe_id: "steamed-sea-bass",
      servings: 2,
      format: "both",
    });
    expect(replacement.raw_markdown).toContain("## 做法");
    expect(replacement.scaled_ingredients.length).toBeGreaterThan(0);

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
