import { describe, expect, it } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import Ajv, { type ValidateFunction } from "ajv";

const specsRoot = join(dirname(fileURLToPath(import.meta.url)), "../..", "specs");

function loadSchemas(): Map<string, ValidateFunction> {
  const ajv = new Ajv({ allErrors: true, strict: false });
  const dirs = ["tools", "knowledge"];
  const byFile = new Map<string, object>();
  for (const dir of dirs) {
    const dirPath = join(specsRoot, dir);
    for (const file of readdirSync(dirPath)) {
      if (!file.endsWith(".schema.json")) continue;
      const schema = JSON.parse(readFileSync(join(dirPath, file), "utf-8"));
      byFile.set(file, schema);
      ajv.addSchema(schema, schema.$id ?? file);
    }
  }
  const compiled = new Map<string, ValidateFunction>();
  for (const [file, schema] of byFile) {
    compiled.set(file, ajv.getSchema((schema as { $id?: string }).$id ?? file)!);
  }
  return compiled;
}

describe("specs 契约自检", () => {
  const schemas = loadSchemas();

  it("覆盖八个工具的输入输出 schema 与共享契约", () => {
    const expected = [
      "common.schema.json",
      "error.schema.json",
      "search-recipes.input.schema.json",
      "search-recipes.output.schema.json",
      "grep-recipe-docs.input.schema.json",
      "grep-recipe-docs.output.schema.json",
      "read-recipe.input.schema.json",
      "read-recipe.output.schema.json",
      "aggregate-shopping-list.input.schema.json",
      "aggregate-shopping-list.output.schema.json",
      "validate-meal-plan.input.schema.json",
      "validate-meal-plan.output.schema.json",
      "quote-ingredient-prices.input.schema.json",
      "quote-ingredient-prices.output.schema.json",
      "find-replacements.input.schema.json",
      "find-replacements.output.schema.json",
      "render-meal-plan-html.input.schema.json",
      "render-meal-plan-html.output.schema.json",
      "recipe-frontmatter.schema.json",
      "ingredient-catalog.schema.json",
      "benchmark-prices.schema.json",
      "substitution.schema.json",
      "recipe-relation.schema.json",
    ];
    expect([...schemas.keys()].sort()).toEqual([...expected].sort());
  });

  it("所有 schema 均可被 ajv 编译", () => {
    expect(schemas.size).toBe(23);
    for (const [file, validate] of schemas) {
      expect(typeof validate, `${file} 应编译为校验函数`).toBe("function");
    }
  });

  it("统一错误契约：接受合法对象，拒绝未知错误码与缺字段", () => {
    const validate = schemas.get("error.schema.json")!;
    expect(
      validate({
        code: "RATE_LIMITED",
        message: "price tool quota exceeded",
        retryable: true,
        request_id: "req-1",
        details: {},
      }),
    ).toBe(true);
    expect(validate({ code: "SOMETHING_ELSE", message: "x", retryable: false })).toBe(false);
    expect(validate({ code: "NOT_FOUND", message: "x" })).toBe(false);
  });

  it("菜谱 frontmatter 契约：PRD §9.2 示例通过校验", () => {
    const validate = schemas.get("recipe-frontmatter.schema.json")!;
    const example = {
      schema_version: 1,
      recipe_id: "tomato-eggs",
      version: 2,
      status: "published",
      name: "番茄炒蛋",
      summary: "十五分钟完成的家常番茄炒蛋",
      servings: 2,
      prep_minutes: 5,
      cook_minutes: 10,
      meal_types: ["lunch", "dinner"],
      difficulty: "easy",
      equipment: ["wok"],
      tags: ["quick", "home-style"],
      dietary_labels: ["vegetarian"],
      allergens: ["egg"],
      ingredients: [
        { id: "tomato", name: "番茄", quantity: 300, unit: "g", preparation: "切块" },
        { id: "egg", name: "鸡蛋", quantity: 3, unit: "piece", preparation: "打散" },
        { id: "salt", name: "盐", quantity: null, unit: null, notes: "按口味添加" },
      ],
      source: { name: "自有菜谱", url: null },
      published_at: "2026-08-23",
    };
    const ok = validate(example);
    expect(ok, JSON.stringify(validate.errors)).toBe(true);
  });

  it("菜谱 frontmatter 契约：拒绝未知单位与空食材表", () => {
    const validate = schemas.get("recipe-frontmatter.schema.json")!;
    expect(validate({ recipe_id: "x", version: 1 })).toBe(false);
  });

  it("菜谱 frontmatter 契约：食材 role/optional/defines_dish 为可选扩展字段（PRD V0.5 设计方向 1）", () => {
    const validate = schemas.get("recipe-frontmatter.schema.json")!;
    const base = {
      schema_version: 1,
      recipe_id: "tomato-eggs",
      version: 2,
      status: "published",
      name: "番茄炒蛋",
      summary: "十五分钟完成的家常番茄炒蛋",
      servings: 2,
      prep_minutes: 5,
      cook_minutes: 10,
      meal_types: ["lunch", "dinner"],
      difficulty: "easy",
      equipment: ["wok"],
      tags: ["quick", "home-style"],
      dietary_labels: ["vegetarian"],
      allergens: ["egg"],
      source: { name: "自有菜谱", url: null },
      published_at: "2026-08-23",
    };
    const withRoleFields = {
      ...base,
      ingredients: [
        { id: "tomato", name: "番茄", quantity: 300, unit: "g", role: "primary", optional: false, defines_dish: true },
        { id: "egg", name: "鸡蛋", quantity: 3, unit: "piece", role: "primary", optional: false, defines_dish: true },
        { id: "salt", name: "盐", quantity: null, unit: null, role: "seasoning", optional: true, defines_dish: false },
      ],
    };
    expect(validate(withRoleFields), JSON.stringify(validate.errors)).toBe(true);

    const withoutRoleFields = {
      ...base,
      ingredients: [{ id: "tomato", name: "番茄", quantity: 300, unit: "g" }],
    };
    expect(validate(withoutRoleFields), JSON.stringify(validate.errors)).toBe(true);

    const withInvalidRole = {
      ...base,
      ingredients: [{ id: "tomato", name: "番茄", quantity: 300, unit: "g", role: "core" }],
    };
    expect(validate(withInvalidRole)).toBe(false);
  });

  it("search_recipes 输入：拒绝未知字段与超界 limit", () => {
    const validate = schemas.get("search-recipes.input.schema.json")!;
    expect(validate({ query: "番茄", limit: 10 })).toBe(true);
    expect(validate({ include_ingredients: ["西红柿"] })).toBe(true);
    expect(validate({ query: "番茄", limit: 999 })).toBe(false);
    expect(validate({ querry: "typo" })).toBe(false);
  });

  it("quote_ingredient_prices 输出：区间与来源类型字段受控", () => {
    const validate = schemas.get("quote-ingredient-prices.output.schema.json")!;
    const ok = validate({
      region: "北京",
      currency: "CNY",
      quotes: [
        {
          ingredient_id: "tomato",
          name: "番茄",
          unit: "斤",
          unit_price: { low: 0.8, high: 1.3 },
          quantity: 2,
          total_price: { low: 1.6, high: 2.6 },
          region: "北京",
          merchant: "北京新发地批发市场",
          source: { type: "realtime", name: "xinfadi", url: "http://www.xinfadi.com.cn/" },
          data_time: "2026-08-23T00:00:00+08:00",
          confidence: "medium",
          requested_region: "北京",
          matched_region: "北京市",
          region_code: "110000",
          region_scope: "province",
          region_match: true,
          is_fallback: false,
          price_basis: "wholesale_observed",
          budget_usable: "reference_only",
          market_count: 3,
          aggregation_method: "market_min_max",
        },
      ],
      unmatched: [],
      warnings: [],
      summary: {
        requested_count: 1,
        quoted_count: 1,
        priced_count: 1,
        exact_region_priced_count: 1,
        province_priced_count: 1,
        national_fallback_count: 0,
        cross_region_fallback_count: 0,
        benchmark_priced_count: 0,
        unmatched_count: 0,
        budget_status: "reference_only",
        complete: true,
        priced_subtotal: { low: 1.6, high: 2.6 },
      },
    });
    expect(ok, JSON.stringify(validate.errors)).toBe(true);
  });

  it("quote_ingredient_prices 输入：可显式禁止全国回退", () => {
    const validate = schemas.get("quote-ingredient-prices.input.schema.json")!;
    expect(
      validate({
        region: "上海",
        ingredients: [{ ingredient: "tomato", quantity: 400, unit: "g" }],
        allow_national_fallback: false,
      }),
      JSON.stringify(validate.errors),
    ).toBe(true);
  });

  it("quote_ingredient_prices 输入：地区可省略以使用全国参考", () => {
    const validate = schemas.get("quote-ingredient-prices.input.schema.json")!;
    expect(
      validate({ ingredients: [{ ingredient: "tomato", quantity: 400, unit: "g" }] }),
      JSON.stringify(validate.errors),
    ).toBe(true);
  });

  it("替换与关系知识契约接受可追溯的发布文档", () => {
    const substitution = schemas.get("substitution.schema.json")!;
    expect(
      substitution({
        schema_version: 1,
        substitution_id: "tomato-eggs-scallion-omit",
        version: 1,
        status: "published",
        from_ingredient: "scallion",
        to_ingredient: null,
        mode: "omit",
        valid_context: { roles: ["garnish"], techniques: ["stir-fry"], recipe_ids: ["tomato-eggs"] },
        ratio: null,
        step_changes: ["省略撒葱花。"],
        allergen_changes: { add: [], remove: [] },
        effects: { flavor: "葱香减弱", texture: "不变", time_delta_minutes: 0 },
        evidence: { type: "recipe_source", source: "recipes/tomato-eggs/番茄炒蛋-v1.md" },
        published_at: "2026-08-24",
      }),
      JSON.stringify(substitution.errors),
    ).toBe(true);

    const relation = schemas.get("recipe-relation.schema.json")!;
    expect(
      relation({
        schema_version: 1,
        relation_id: "tomato-eggs-garlic-broccoli-pair",
        version: 1,
        status: "published",
        type: "pairs_with",
        source_recipe_id: "tomato-eggs",
        target_recipe_id: "garlic-broccoli",
        reason: "蛋类主菜搭配快手蔬菜。",
        published_at: "2026-08-24",
      }),
      JSON.stringify(relation.errors),
    ).toBe(true);
  });
});
