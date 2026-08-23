import { stringify as yamlStringify } from "yaml";
import { CatalogIndex } from "./catalog.ts";
import { notFound } from "./errors.ts";
import type { KnowledgeRepo } from "./repo.ts";
import { round2 } from "./units.ts";
import type { MealType, RecipeDocument, Warning } from "./types.ts";

export interface SearchParams {
  query?: string;
  meal_types?: MealType[];
  include_ingredients?: string[];
  exclude_ingredients?: string[];
  dietary_constraints?: string[];
  exclude_allergens?: string[];
  max_total_minutes?: number;
  equipment?: string[];
  difficulty?: "easy" | "medium" | "hard";
  limit?: number;
  cursor?: string;
}

export interface SearchItem {
  recipe_id: string;
  version: number;
  name: string;
  summary: string;
  core_ingredients: Array<{ id: string | null; name: string }>;
  total_minutes: number;
  meal_types: MealType[];
  difficulty: "easy" | "medium" | "hard";
  tags: string[];
  allergens: string[];
  match: { fields: string[]; reason: string };
}

export interface GrepParams {
  pattern: string;
  recipe_ids?: string[];
  sections?: string[];
  limit?: number;
  cursor?: string;
}

export interface ReadParams {
  recipe_id: string;
  version?: number | null;
  servings?: number | null;
  format?: "raw" | "parsed" | "both";
}

/** 结构化索引 + 受限正文搜索。仅覆盖当前 published 菜谱（PRD §9.5）。 */
export class RecipeSearchService {
  constructor(
    private readonly repo: KnowledgeRepo,
    private readonly catalog: CatalogIndex,
  ) {}

  search(params: SearchParams): {
    items: SearchItem[];
    next_cursor: string | null;
    total_matched: number;
  } {
    const published = this.repo.listPublished();
    const hardFiltered = published.filter(({ doc }) => this.passesHardFilters(doc, params));

    const scored: Array<{ item: SearchItem; score: number }> = [];
    for (const { doc } of hardFiltered) {
      const match = this.matchQuery(doc, params.query);
      if (params.query && !match.matched) continue;
      scored.push({ item: this.toItem(doc, match.fields), score: match.score });
    }
    scored.sort((a, b) => {
      if (b.score !== a.score) return b.score - a.score;
      if (a.item.total_minutes !== b.item.total_minutes) return a.item.total_minutes - b.item.total_minutes;
      return a.item.recipe_id.localeCompare(b.item.recipe_id);
    });

    const limit = params.limit ?? 10;
    const offset = decodeCursor(params.cursor);
    const page = scored.slice(offset, offset + limit);
    const nextOffset = offset + limit;
    return {
      items: page.map((s) => s.item),
      next_cursor: nextOffset < scored.length ? encodeCursor(nextOffset) : null,
      total_matched: scored.length,
    };
  }

  grep(params: GrepParams): {
    matches: Array<{
      recipe_id: string;
      version: number;
      section: string;
      line: number;
      excerpt: string;
    }>;
    next_cursor: string | null;
    total_matched: number;
  } {
    const needle = params.pattern.toLowerCase();
    const sections = params.sections?.map((s) => s.toLowerCase());
    const matches: Array<{
      recipe_id: string;
      version: number;
      section: string;
      line: number;
      excerpt: string;
    }> = [];
    const docs = this.repo
      .listPublished()
      .filter(({ doc }) => !params.recipe_ids || params.recipe_ids.includes(doc.meta.recipe_id));
    for (const { doc } of docs) {
      let section = "";
      const lines = doc.body.split(/\r?\n/);
      for (let i = 0; i < lines.length; i++) {
        const line = lines[i]!;
        const heading = /^##\s+(.+)$/.exec(line.trim());
        if (heading) {
          section = heading[1]!.trim();
          continue;
        }
        if (sections && !sections.includes(section.toLowerCase())) continue;
        if (line.toLowerCase().includes(needle)) {
          matches.push({
            recipe_id: doc.meta.recipe_id,
            version: doc.meta.version,
            section,
            line: i + 1,
            excerpt: line.trim().slice(0, 240),
          });
        }
      }
    }
    const limit = params.limit ?? 10;
    const offset = decodeCursor(params.cursor);
    const page = matches.slice(offset, offset + limit);
    const nextOffset = offset + limit;
    return {
      matches: page,
      next_cursor: nextOffset < matches.length ? encodeCursor(nextOffset) : null,
      total_matched: matches.length,
    };
  }

  read(params: ReadParams): Record<string, unknown> {
    const doc = this.repo.getRecipe(params.recipe_id, params.version);
    const meta = doc.meta;
    const warnings: Warning[] = [];
    const format = params.format ?? "both";
    const result: Record<string, unknown> = {
      recipe_id: meta.recipe_id,
      version: meta.version,
      status: meta.status,
      warnings,
    };
    if (format === "raw" || format === "both") {
      result.raw_markdown = this.renderRaw(doc);
    }
    if (format === "parsed" || format === "both") {
      result.parsed = {
        name: meta.name,
        summary: meta.summary,
        servings: meta.servings,
        prep_minutes: meta.prep_minutes,
        cook_minutes: meta.cook_minutes,
        total_minutes: meta.prep_minutes + meta.cook_minutes,
        meal_types: meta.meal_types,
        difficulty: meta.difficulty,
        equipment: meta.equipment,
        tags: meta.tags,
        dietary_labels: meta.dietary_labels,
        allergens: meta.allergens,
        ingredients: meta.ingredients,
        source: meta.source,
        ...(meta.published_at ? { published_at: meta.published_at } : {}),
      };
    }
    if (params.servings != null) {
      const scale = params.servings / meta.servings;
      result.scaled_servings = params.servings;
      result.scaled_ingredients = meta.ingredients.map((ing) => {
        if (ing.quantity == null || ing.unit == null) {
          warnings.push({
            code: "NON_QUANTIFIED",
            message: `${ing.name} 未量化（${ing.notes ?? "按口味添加"}），未参与份数换算`,
            subject: ing.id,
          });
          return { id: ing.id, name: ing.name, quantity: null, unit: null };
        }
        const scaled = round2(ing.quantity * scale);
        if (ing.unit === "piece" && !Number.isInteger(scaled)) {
          warnings.push({
            code: "FRACTIONAL_PIECE",
            message: `${ing.name} 换算后为 ${scaled} 个，保留原值未取整`,
            subject: ing.id,
          });
        }
        return { id: ing.id, name: ing.name, quantity: scaled, unit: ing.unit };
      });
    }
    if (params.version == null) {
      // 读取当前版本时无需额外提示
    }
    return result;
  }

  private passesHardFilters(doc: RecipeDocument, params: SearchParams): boolean {
    const meta = doc.meta;
    if (params.meal_types?.length && !params.meal_types.some((t) => meta.meal_types.includes(t))) {
      return false;
    }
    if (params.difficulty && meta.difficulty !== params.difficulty) return false;
    const total = meta.prep_minutes + meta.cook_minutes;
    if (params.max_total_minutes != null && total > params.max_total_minutes) return false;

    if (params.equipment?.length) {
      const available = new Set(params.equipment);
      if (!meta.equipment.every((e) => available.has(e))) return false;
    }
    if (params.exclude_allergens?.length) {
      const declared = new Set(meta.allergens);
      const derived = this.catalog.allergenUnion(meta.ingredients.map((i) => i.id));
      for (const a of params.exclude_allergens) {
        if (declared.has(a) || derived.has(a)) return false;
      }
    }
    if (params.exclude_ingredients?.length) {
      for (const ref of params.exclude_ingredients) {
        if (this.recipeHasIngredient(doc, ref)) return false;
      }
    }
    if (params.include_ingredients?.length) {
      for (const ref of params.include_ingredients) {
        if (!this.recipeHasIngredient(doc, ref)) return false;
      }
    }
    if (params.dietary_constraints?.length) {
      const labels = new Set(meta.dietary_labels);
      for (const d of params.dietary_constraints) {
        if (!labels.has(d)) return false;
      }
    }
    return true;
  }

  private recipeHasIngredient(doc: RecipeDocument, ref: string): boolean {
    const target = this.catalog.resolve(ref);
    if (target) {
      return doc.meta.ingredients.some((i) => i.id === target.id);
    }
    const needle = ref.toLowerCase();
    return doc.meta.ingredients.some(
      (i) => i.name.toLowerCase() === needle || i.id.toLowerCase() === needle,
    );
  }

  private matchQuery(
    doc: RecipeDocument,
    query: string | undefined,
  ): { matched: boolean; fields: string[]; score: number } {
    const meta = doc.meta;
    if (!query) return { matched: true, fields: [], score: 0 };
    const terms = query.trim().toLowerCase().split(/\s+/).filter(Boolean);
    const fields = new Set<string>();
    let score = 0;
    for (const term of terms) {
      let hit = false;
      if (meta.name.toLowerCase().includes(term)) {
        fields.add("name");
        score += 3;
        hit = true;
      }
      if (meta.tags.some((t) => t.toLowerCase().includes(term))) {
        fields.add("tags");
        score += 2;
        hit = true;
      }
      if (
        meta.ingredients.some((i) => {
          const cat = this.catalog.byIdentifier(i.id);
          return (
            i.name.toLowerCase().includes(term) ||
            (cat?.canonical_name.toLowerCase().includes(term) ?? false) ||
            (cat?.aliases.some((a) => a.toLowerCase().includes(term)) ?? false)
          );
        })
      ) {
        fields.add("ingredient");
        score += 1.5;
        hit = true;
      }
      if (meta.summary.toLowerCase().includes(term)) {
        fields.add("summary");
        score += 1;
        hit = true;
      }
      if (!hit) return { matched: false, fields: [], score: 0 };
    }
    return { matched: true, fields: [...fields], score };
  }

  private toItem(doc: RecipeDocument, fields: string[]): SearchItem {
    const meta = doc.meta;
    return {
      recipe_id: meta.recipe_id,
      version: meta.version,
      name: meta.name,
      summary: meta.summary,
      core_ingredients: meta.ingredients.slice(0, 8).map((i) => ({ id: i.id, name: i.name })),
      total_minutes: meta.prep_minutes + meta.cook_minutes,
      meal_types: meta.meal_types,
      difficulty: meta.difficulty,
      tags: meta.tags,
      allergens: meta.allergens,
      match: {
        fields,
        reason: fields.length
          ? `命中字段: ${fields.join(", ")}`
          : "未提供查询词，仅按结构化过滤匹配",
      },
    };
  }

  private renderRaw(doc: RecipeDocument): string {
    const yamlText = yamlStringify(doc.meta as unknown as Record<string, unknown>, {
      lineWidth: 100,
    });
    return `---\n${yamlText.trimEnd()}\n---\n${doc.body}`;
  }
}

function encodeCursor(offset: number): string {
  return Buffer.from(JSON.stringify({ o: offset }), "utf-8").toString("base64url");
}

function decodeCursor(cursor: string | undefined): number {
  if (!cursor) return 0;
  try {
    const parsed = JSON.parse(Buffer.from(cursor, "base64url").toString("utf-8"));
    const o = parsed.o;
    if (typeof o === "number" && Number.isInteger(o) && o >= 0) return o;
  } catch {
    // fallthrough
  }
  throw notFound("分页游标无效", { cursor });
}
