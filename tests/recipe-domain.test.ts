import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { stringify as yamlStringify } from "yaml";
import {
  aggregateShoppingList,
  CatalogIndex,
  KnowledgeRepo,
  RecipeSearchService,
  renderMealPlanHtml,
  ToolError,
  toBaseUnit,
  validateMealPlan,
} from "@what2eat/recipe-domain";

let knowledgeDir: string;

function mdFromMeta(meta: Record<string, unknown>, body?: string): string {
  const content =
    body ??
    `# ${meta.name}\n\n## 做法\n\n1. 番茄切块，鸡蛋打散。\n2. 温油下锅，慢炒出汁后出锅。\n\n## 替换建议\n\n- 无特殊替换建议。\n\n## 储存与安全\n\n- 当餐食用，冷藏不超过 24 小时。\n`;
  return `---\n${yamlStringify(meta).trimEnd()}\n---\n${content}`;
}

const CATALOG = {
  schema_version: 1,
  catalog_version: 1,
  ingredients: [
    {
      id: "tomato",
      canonical_name: "番茄",
      aliases: ["西红柿"],
      category: "vegetable",
      default_purchase_unit: "斤",
      conversions: [],
      allergen_tags: [],
      price_query_terms: [{ source: "xinfadi", terms: ["番茄"] }],
    },
    {
      id: "egg",
      canonical_name: "鸡蛋",
      aliases: [],
      category: "egg_dairy",
      default_purchase_unit: "斤",
      conversions: [{ from_unit: "piece", to_unit: "g", factor: 50, approximate: true }],
      allergen_tags: ["egg"],
      price_query_terms: [{ source: "xinfadi", terms: ["鸡蛋"], preferred_specs: ["净"] }],
    },
    {
      id: "pork_belly",
      canonical_name: "五花肉",
      aliases: ["猪五花"],
      category: "meat",
      default_purchase_unit: "斤",
      conversions: [],
      allergen_tags: [],
      price_query_terms: [{ source: "xinfadi", terms: ["五花肉"], preferred_specs: ["瘦"] }],
    },
    {
      id: "salt",
      canonical_name: "盐",
      aliases: ["食盐"],
      category: "oil_condiment",
      default_purchase_unit: "g",
      conversions: [],
      allergen_tags: [],
      price_query_terms: [],
    },
  ],
};

function baseMeta(id: string, version: number, overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    schema_version: 1,
    recipe_id: id,
    version,
    status: "published",
    name: `菜-${id}`,
    summary: `${id} 的家常做法`,
    servings: 2,
    prep_minutes: 5,
    cook_minutes: 10,
    meal_types: ["dinner"],
    difficulty: "easy",
    equipment: ["wok"],
    tags: ["home-style"],
    dietary_labels: [],
    allergens: [],
    ingredients: [
      { id: "tomato", name: "番茄", quantity: 300, unit: "g" },
      { id: "egg", name: "鸡蛋", quantity: 3, unit: "piece" },
      { id: "salt", name: "盐", quantity: null, unit: null, notes: "按口味添加" },
    ],
    source: { name: "自有菜谱", url: null },
    published_at: "2026-08-23",
    ...overrides,
  };
}

function writePublished(id: string, version: number, overrides: Record<string, unknown> = {}): void {
  const dir = join(knowledgeDir, "recipes", id);
  mkdirSync(dir, { recursive: true });
  const meta = baseMeta(id, version, overrides);
  const namePrefix = String(meta.name).replace(/[<>:"/\\|?*]/g, "");
  writeFileSync(join(dir, `${namePrefix}-v${version}.md`), mdFromMeta(meta), "utf-8");
}

beforeAll(() => {
  knowledgeDir = mkdtempSync(join(tmpdir(), "what2eat-test-"));
  mkdirSync(join(knowledgeDir, "ingredients"), { recursive: true });
  writeFileSync(
    join(knowledgeDir, "ingredients", "catalog.md"),
    mdFromMeta(CATALOG as unknown as Record<string, unknown>, "## 说明\n\n标准食材目录。\n"),
    "utf-8",
  );
  writePublished("tomato-eggs", 1);
  writePublished("tomato-eggs", 2);
  writePublished(
    "pork-stew",
    1,
    {
      name: "红烧肉",
      tags: ["braised"],
      difficulty: "medium",
      prep_minutes: 15,
      cook_minutes: 90,
      ingredients: [
        { id: "pork_belly", name: "五花肉", quantity: 500, unit: "g" },
        { id: "salt", name: "盐", quantity: null, unit: null, notes: "按口味添加" },
      ],
    },
  );
});

afterAll(() => {
  rmSync(knowledgeDir, { recursive: true, force: true });
});

function makeServices(): { repo: KnowledgeRepo; catalog: CatalogIndex; search: RecipeSearchService } {
  const repo = new KnowledgeRepo(knowledgeDir);
  const catalog = new CatalogIndex(repo.loadCatalog());
  const search = new RecipeSearchService(repo, catalog);
  return { repo, catalog, search };
}

describe("版本状态机", () => {
  it("当前版本 = 最高非草稿版本；历史版本仍可读取", () => {
    const { repo } = makeServices();
    const state = repo.stateOf("tomato-eggs")!;
    expect(state.currentVersion).toBe(2);
    expect(state.versions).toEqual([1, 2]);
    expect(repo.getRecipe("tomato-eggs", 1).meta.version).toBe(1);
    expect(repo.getRecipe("tomato-eggs").meta.version).toBe(2);
  });

  it("不存在的菜谱/版本返回 NOT_FOUND", () => {
    const { repo } = makeServices();
    expect(() => repo.getRecipe("nope")).toThrowError(ToolError);
    try {
      repo.getRecipe("tomato-eggs", 99);
      expect.unreachable();
    } catch (e) {
      expect((e as ToolError).code).toBe("NOT_FOUND");
    }
  });
});

describe("路径安全", () => {
  it("目录穿越与非法输入被拒绝", () => {
    const { repo } = makeServices();
    expect(() => repo.resolveRecipePath("../evil", 1, "测试菜")).toThrowError(ToolError);
    expect(() => repo.resolveRecipePath("a/b", 1, "测试菜")).toThrowError(ToolError);
    expect(() => repo.resolveRecipePath("ok-id", 1.5, "测试菜")).toThrowError(ToolError);
    expect(repo.resolveRecipePath("ok-id", 3, "测试菜")).toMatch(/[\\/]ok-id[\\/]测试菜-v3\.md$/);
  });

  it("菜名里的文件系统非法字符在生成文件名时被过滤", () => {
    const { repo } = makeServices();
    expect(repo.resolveRecipePath("ok-id", 1, '测试/菜:名*')).toMatch(/[\\/]ok-id[\\/]测试菜名-v1\.md$/);
  });
});

describe("search_recipes", () => {
  it("排除过敏原是确定性硬过滤：egg 过滤掉含蛋菜谱", () => {
    const { search } = makeServices();
    const result = search.search({ exclude_allergens: ["egg"] });
    expect(result.items.map((i) => i.recipe_id)).toEqual(["pork-stew"]);
  });

  it("时长与关键词过滤可组合", () => {
    const { search } = makeServices();
    expect(search.search({ max_total_minutes: 30 }).items.map((i) => i.recipe_id)).toEqual([
      "tomato-eggs",
    ]);
    const byQuery = search.search({ query: "红烧" });
    expect(byQuery.items.map((i) => i.recipe_id)).toEqual(["pork-stew"]);
    expect(byQuery.items[0]!.match.fields).toContain("name");
  });

  it("include_ingredients 支持别名（西红柿 → tomato）", () => {
    const { search } = makeServices();
    const result = search.search({ include_ingredients: ["西红柿"] });
    expect(result.items.map((i) => i.recipe_id)).toEqual(["tomato-eggs"]);
  });

  it("分页游标可用且无效游标报错", () => {
    const { search } = makeServices();
    const p1 = search.search({ limit: 1 });
    expect(p1.items.length).toBe(1);
    expect(p1.next_cursor).toBeTruthy();
    const p2 = search.search({ limit: 1, cursor: p1.next_cursor! });
    expect(p2.items.length).toBe(1);
    expect(p2.items[0]!.recipe_id).not.toBe(p1.items[0]!.recipe_id);
    expect(() => search.search({ cursor: "garbage!" })).toThrowError(ToolError);
  });
});

describe("grep_recipe_docs", () => {
  it("按行定位正文命中并标注章节", () => {
    const { search } = makeServices();
    const result = search.grep({ pattern: "慢炒出汁" });
    expect(result.total_matched).toBeGreaterThanOrEqual(1);
    const hit = result.matches[0]!;
    expect(hit.recipe_id).toBeTruthy();
    expect(hit.section).toBe("做法");
    expect(hit.line).toBeGreaterThan(0);
  });

  it("sections 过滤与无结果路径", () => {
    const { search } = makeServices();
    expect(search.grep({ pattern: "番茄", sections: ["不存在章节"] }).total_matched).toBe(0);
    expect(search.grep({ pattern: "绝对不存在的词" }).total_matched).toBe(0);
  });
});

describe("read_recipe", () => {
  it("按份数换算并产生非精确量警告", () => {
    const { search } = makeServices();
    const result = search.read({ recipe_id: "tomato-eggs", servings: 4, format: "parsed" }) as {
      scaled_ingredients: Array<{ id: string; quantity: number | null }>;
      warnings: Array<{ code: string }>;
    };
    const tomato = result.scaled_ingredients.find((i) => i.id === "tomato")!;
    expect(tomato.quantity).toBe(600);
    expect(result.warnings.some((w) => w.code === "NON_QUANTIFIED")).toBe(true);
  });

  it("raw 格式返回原文且含 frontmatter", () => {
    const { search } = makeServices();
    const result = search.read({ recipe_id: "tomato-eggs", version: 1, format: "raw" }) as {
      raw_markdown: string;
      version: number;
    };
    expect(result.version).toBe(1);
    expect(result.raw_markdown.startsWith("---")).toBe(true);
    expect(result.raw_markdown).toContain("## 做法");
  });
});

describe("aggregate_shopping_list", () => {
  it("跨菜谱合并、单位换算、扣库存、非量化警告", () => {
    const { repo, catalog } = makeServices();
    const result = aggregateShoppingList(
      repo,
      catalog,
      [
        { recipe_id: "tomato-eggs", servings: 2 },
        { recipe_id: "tomato-eggs", servings: 2 },
      ],
      [{ ingredient: "西红柿", quantity: 200, unit: "g" }],
    ) as {
      groups: Array<{ category: string; items: Array<Record<string, unknown>> }>;
      warnings: Array<{ code: string }>;
      unresolved: unknown[];
    };
    const veg = result.groups.find((g) => g.category === "蔬菜")!;
    const tomato = veg.items.find((i) => i.ingredient_id === "tomato") as {
      total_required: { quantity: number; unit: string };
      owned: { quantity: number };
      to_buy: { quantity: number; unit: string };
    };
    // 两份菜各 300g（servings=2 恰为基准份数，scale=1）→ 600g = 1.2 斤；库存 200g → 400g = 0.8 斤
    expect(tomato.total_required.quantity).toBe(1.2);
    expect(tomato.total_required.unit).toBe("斤");
    expect(tomato.to_buy.quantity).toBe(0.8);
    expect(result.warnings.some((w) => w.code === "NON_QUANTIFIED")).toBe(true);
    expect(result.warnings.some((w) => w.code === "APPROXIMATE_CONVERSION")).toBe(true);
    expect(result.unresolved).toEqual([]);
  });

  it("不存在的菜谱进入 unresolved 而不是失败", () => {
    const { repo, catalog } = makeServices();
    const result = aggregateShoppingList(repo, catalog, [
      { recipe_id: "ghost", servings: 2 },
    ]) as { unresolved: Array<{ subject: string }> };
    expect(result.unresolved[0]!.subject).toBe("ghost");
  });

  it("领域层拒绝非法份数与非有限换算数量", () => {
    const { repo, catalog } = makeServices();
    const result = aggregateShoppingList(repo, catalog, [
      { recipe_id: "tomato-eggs", servings: Number.NaN },
    ]) as { groups: unknown[]; unresolved: Array<{ reason: string }> };
    expect(result.groups).toEqual([]);
    expect(result.unresolved[0]!.reason).toContain("正有限数");

    const conversion = toBaseUnit(catalog.byIdentifier("tomato")!, Number.POSITIVE_INFINITY, "g");
    expect(conversion).toEqual({ ok: false, reason: "数量必须是非负有限数" });
  });
});

describe("validate_meal_plan", () => {
  it("过敏原冲突是硬错误（含目录复核路径）", () => {
    const { repo, catalog } = makeServices();
    const result = validateMealPlan(repo, catalog, {
      meals: [{ date: "2026-08-25", meal_type: "dinner", recipe_id: "tomato-eggs", servings: 2 }],
      constraints: { exclude_allergens: ["egg"] },
    }) as { errors: Array<{ code: string }> };
    expect(result.errors.some((e) => e.code === "ALLERGEN_CONFLICT")).toBe(true);
  });

  it("同一餐次允许多道不同菜，且仍能校验 expected_scope 完整性", () => {
    const { repo, catalog } = makeServices();
    const result = validateMealPlan(repo, catalog, {
      meals: [
        { date: "2026-08-25", meal_type: "dinner", recipe_id: "pork-stew", servings: 2 },
        { date: "2026-08-26", meal_type: "dinner", recipe_id: "tomato-eggs", servings: 2 },
        { date: "2026-08-26", meal_type: "dinner", recipe_id: "pork-stew", servings: 2 },
      ],
      expected_scope: {
        dates: ["2026-08-25", "2026-08-26"],
        meal_types: ["dinner"],
      },
    }) as { errors: Array<{ code: string }> };
    expect(result.errors).toEqual([]);
    expect(result.errors.some((e) => e.code === "MISSING_MEAL")).toBe(false);
    const withGap = validateMealPlan(repo, catalog, {
      meals: [
        { date: "2026-08-25", meal_type: "dinner", recipe_id: "pork-stew", servings: 2 },
      ],
      expected_scope: { dates: ["2026-08-25", "2026-08-27"], meal_types: ["dinner"] },
    }) as { errors: Array<{ code: string }> };
    expect(withGap.errors.some((e) => e.code === "MISSING_MEAL")).toBe(true);
  });

  it("同一餐次重复同一道菜返回 DUPLICATE_RECIPE_IN_SLOT", () => {
    const { repo, catalog } = makeServices();
    const result = validateMealPlan(repo, catalog, {
      meals: [
        { date: "2026-08-25", meal_type: "dinner", recipe_id: "tomato-eggs", servings: 2 },
        { date: "2026-08-25", meal_type: "dinner", recipe_id: "tomato-eggs", version: 2, servings: 2 },
      ],
    }) as { errors: Array<{ code: string }> };
    expect(result.errors.map((error) => error.code)).toEqual(["DUPLICATE_RECIPE_IN_SLOT"]);
  });

  it("硬预算：估价下限超预算为错误，区间骑墙为警告", () => {
    const { repo, catalog } = makeServices();
    const over = validateMealPlan(repo, catalog, {
      meals: [{ date: "2026-08-25", meal_type: "dinner", recipe_id: "pork-stew", servings: 2 }],
      constraints: { budget: { mode: "hard", amount: 10, currency: "CNY" } },
      pricing: { total_range: { low: 12, high: 15 }, currency: "CNY", complete: true },
    }) as { errors: Array<{ code: string }>; warnings: Array<{ code: string }> };
    expect(over.errors.some((e) => e.code === "BUDGET_EXCEEDED")).toBe(true);
    const tight = validateMealPlan(repo, catalog, {
      meals: [{ date: "2026-08-25", meal_type: "dinner", recipe_id: "pork-stew", servings: 2 }],
      constraints: { budget: { mode: "hard", amount: 13, currency: "CNY" } },
      pricing: { total_range: { low: 12, high: 15 }, currency: "CNY", complete: true },
    }) as { errors: Array<{ code: string }>; warnings: Array<{ code: string }> };
    expect(tight.errors).toEqual([]);
    expect(tight.warnings.some((w) => w.code === "BUDGET_TIGHT")).toBe(true);

    const unverified = validateMealPlan(repo, catalog, {
      meals: [{ date: "2026-08-25", meal_type: "dinner", recipe_id: "pork-stew", servings: 2 }],
      constraints: { budget: { mode: "hard", amount: 100, currency: "CNY" } },
      pricing: { total_range: { low: 3.55, high: 3.92 }, currency: "CNY", complete: false },
    }) as { errors: Array<{ code: string }> };
    expect(unverified.errors.some((e) => e.code === "BUDGET_UNVERIFIED")).toBe(true);

    const referenceOnly = validateMealPlan(repo, catalog, {
      meals: [{ date: "2026-08-25", meal_type: "dinner", recipe_id: "pork-stew", servings: 2 }],
      constraints: { budget: { mode: "hard", amount: 100, currency: "CNY" } },
      pricing: {
        total_range: { low: 30, high: 50 },
        currency: "CNY",
        complete: true,
        budget_status: "reference_only",
      },
    }) as { errors: Array<{ code: string }> };
    expect(referenceOnly.errors.some((e) => e.code === "BUDGET_UNVERIFIED")).toBe(true);

    const missing = validateMealPlan(repo, catalog, {
      meals: [{ date: "2026-08-25", meal_type: "dinner", recipe_id: "pork-stew", servings: 2 }],
      constraints: { budget: { mode: "hard", amount: 100, currency: "CNY" } },
    }) as { errors: Array<{ code: string }> };
    expect(missing.errors.some((e) => e.code === "BUDGET_UNVERIFIED")).toBe(true);
  });

  it("时长超限为硬错误", () => {
    const { repo, catalog } = makeServices();
    const result = validateMealPlan(repo, catalog, {
      meals: [{ date: "2026-08-25", meal_type: "dinner", recipe_id: "pork-stew", servings: 2 }],
      constraints: { max_cooking_minutes: 30 },
    }) as { errors: Array<{ code: string }> };
    expect(result.errors.some((e) => e.code === "TIME_EXCEEDED")).toBe(true);
  });
});

describe("render_meal_plan_html", () => {
  it("输出自包含、可打印的 HTML，并转义不可信文本", () => {
    const html = renderMealPlanHtml({
      title: "两天餐单 <script>alert(1)</script>",
      summary: { servings: "2 人份", constraints: ["无忌口"] },
      menu: [
        {
          date: "2026-08-25",
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
          steps: ["番茄切块后炒制。"],
        },
      ],
      shopping_groups: [
        {
          category: "蔬菜",
          items: [{ name: "番茄", required: "400 g", to_buy: "400 g", used_in: ["番茄炒蛋"] }],
        },
      ],
      pricing: {
        requested_region: "全国",
        currency: "CNY",
        total_range: { low: 3, high: 5 },
        budget_status: "reference_only",
        coverage_summary: "1 项全国参考",
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
    });
    expect(html).toContain("<!doctype html>");
    expect(html).toContain("<h2>物价与预算</h2>");
    expect(html).toContain("@media print");
    expect(html).toContain("&lt;script&gt;alert(1)&lt;/script&gt;");
    expect(html).not.toContain("<script>alert(1)</script>");
  });
});
