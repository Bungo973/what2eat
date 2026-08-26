import { stringify as yamlStringify } from "yaml";
import { CatalogIndex } from "./catalog.ts";
import { notFound } from "./errors.ts";
import type { KnowledgeRepo } from "./repo.ts";
import { dampedScale, round2 } from "./units.ts";
import type { DishRole, MealType, RecipeDocument, Warning } from "./types.ts";

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
  dish_role?: DishRole;
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
  dish_role?: DishRole;
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
    /** 用于同分候选组内洗牌的随机源；测试可注入固定实现，默认 Math.random。 */
    private readonly rng: () => number = Math.random,
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
    // 只保留真实相关性排序（score、耗时）；recipe_id 决胜由下面的同分组内洗牌取代，
    // 避免"结果顺序固定 -> agent 总是选同一个候选"的偏差。
    scored.sort((a, b) => {
      if (b.score !== a.score) return b.score - a.score;
      return a.item.total_minutes - b.item.total_minutes;
    });

    const { offset, seed: cursorSeed } = decodeCursor(params.cursor);
    // 同一次翻页复用游标里带的种子，保证跨页不重复/不丢项；全新查询才换种子。
    const seed = cursorSeed ?? Math.floor(this.rng() * 0xffffffff);
    shuffleTieGroups(scored, mulberry32(seed));

    const limit = params.limit ?? 10;
    const page = scored.slice(offset, offset + limit);
    const nextOffset = offset + limit;
    return {
      items: page.map((s) => s.item),
      next_cursor: nextOffset < scored.length ? encodeCursor(nextOffset, seed) : null,
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
    const offset = decodeCursor(params.cursor).offset;
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
        ...(meta.dish_role ? { dish_role: meta.dish_role } : {}),
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
        const scaled = round2(ing.quantity * dampedScale(ing.role, scale));
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
    if (params.dish_role && meta.dish_role !== params.dish_role) return false;
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
      ...(meta.dish_role ? { dish_role: meta.dish_role } : {}),
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

function encodeCursor(offset: number, seed?: number): string {
  const payload: { o: number; s?: number } = { o: offset };
  if (seed !== undefined) payload.s = seed;
  return Buffer.from(JSON.stringify(payload), "utf-8").toString("base64url");
}

function decodeCursor(cursor: string | undefined): { offset: number; seed: number | null } {
  if (!cursor) return { offset: 0, seed: null };
  try {
    const parsed = JSON.parse(Buffer.from(cursor, "base64url").toString("utf-8"));
    const o = parsed.o;
    const s = parsed.s;
    if (typeof o === "number" && Number.isInteger(o) && o >= 0) {
      return { offset: o, seed: typeof s === "number" ? s : null };
    }
  } catch {
    // fallthrough
  }
  throw notFound("分页游标无效", { cursor });
}

/** mulberry32：小型可播种 PRNG，仅用于同分候选组内洗牌，不用于任何安全场景。 */
function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return function () {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** 对 (score, total_minutes) 完全相同的连续候选组做 Fisher–Yates 洗牌，组间顺序不变。 */
function shuffleTieGroups(
  scored: Array<{ item: SearchItem; score: number }>,
  rng: () => number,
): void {
  let i = 0;
  while (i < scored.length) {
    let j = i + 1;
    while (
      j < scored.length &&
      scored[j]!.score === scored[i]!.score &&
      scored[j]!.item.total_minutes === scored[i]!.item.total_minutes
    ) {
      j++;
    }
    for (let k = j - 1; k > i; k--) {
      const r = i + Math.floor(rng() * (k - i + 1));
      const tmp = scored[k]!;
      scored[k] = scored[r]!;
      scored[r] = tmp;
    }
    i = j;
  }
}
