import { readFileSync } from "node:fs";
import { join } from "node:path";
import Ajv, { type ValidateFunction } from "ajv";
import { specsDir } from "./paths.ts";

export type ToolName =
  | "search_recipes"
  | "grep_recipe_docs"
  | "read_recipe"
  | "aggregate_shopping_list"
  | "validate_meal_plan"
  | "quote_ingredient_prices";

const TOOL_SCHEMA_FILE: Record<ToolName, string> = {
  search_recipes: "search-recipes",
  grep_recipe_docs: "grep-recipe-docs",
  read_recipe: "read-recipe",
  aggregate_shopping_list: "aggregate-shopping-list",
  validate_meal_plan: "validate-meal-plan",
  quote_ingredient_prices: "quote-ingredient-prices",
};

let ajvInstance: Ajv | null = null;
const compiled = new Map<string, ValidateFunction>();

function getAjv(): Ajv {
  if (ajvInstance) return ajvInstance;
  const ajv = new Ajv({ allErrors: true, strict: false });
  const root = specsDir();
  const files = [
    join(root, "tools", "common.schema.json"),
    join(root, "tools", "error.schema.json"),
    ...Object.values(TOOL_SCHEMA_FILE).map((f) => join(root, "tools", `${f}.input.schema.json`)),
    ...Object.values(TOOL_SCHEMA_FILE).map((f) => join(root, "tools", `${f}.output.schema.json`)),
    join(root, "knowledge", "recipe-frontmatter.schema.json"),
    join(root, "knowledge", "ingredient-catalog.schema.json"),
    join(root, "knowledge", "benchmark-prices.schema.json"),
  ];
  for (const file of files) {
    const schema = JSON.parse(readFileSync(file, "utf-8"));
    ajv.addSchema(schema, schema.$id ?? file);
  }
  ajvInstance = ajv;
  return ajv;
}

function compile(id: string): ValidateFunction {
  const cached = compiled.get(id);
  if (cached) return cached;
  const validate = getAjv().getSchema(id)!;
  compiled.set(id, validate);
  return validate;
}

function formatErrors(validate: ValidateFunction): string {
  return (validate.errors ?? [])
    .map((e) => `${e.instancePath || "(root)"} ${e.message ?? ""}`.trim())
    .join("; ");
}

export function validateFrontmatter(meta: unknown): { ok: true } | { ok: false; message: string } {
  const validate = compile("recipe-frontmatter.schema.json");
  if (validate(meta)) return { ok: true };
  return { ok: false, message: formatErrors(validate) };
}

export function validateCatalog(catalog: unknown): { ok: true } | { ok: false; message: string } {
  const validate = compile("ingredient-catalog.schema.json");
  if (validate(catalog)) return { ok: true };
  return { ok: false, message: formatErrors(validate) };
}

export function validateBenchmarkPrices(doc: unknown): { ok: true } | { ok: false; message: string } {
  const validate = compile("benchmark-prices.schema.json");
  if (validate(doc)) return { ok: true };
  return { ok: false, message: formatErrors(validate) };
}

export function validateToolInput(tool: ToolName, input: unknown): { ok: true } | { ok: false; message: string } {
  const validate = compile(`${TOOL_SCHEMA_FILE[tool]}.input.schema.json`);
  if (validate(input)) return { ok: true };
  return { ok: false, message: formatErrors(validate) };
}

export function validateToolOutput(tool: ToolName, output: unknown): { ok: true } | { ok: false; message: string } {
  const validate = compile(`${TOOL_SCHEMA_FILE[tool]}.output.schema.json`);
  if (validate(output)) return { ok: true };
  return { ok: false, message: formatErrors(validate) };
}

export function validateErrorContract(err: unknown): boolean {
  const validate = compile("error.schema.json");
  return validate(err) === true;
}
