export interface MealPlanHtmlInput {
  title: string;
  summary?: { date_range?: string; servings?: string; constraints?: string[] };
  menu: Array<{
    date: string;
    meal_type: string;
    dishes: Array<{
      name: string;
      recipe_id: string;
      version: number;
      servings: number;
      total_minutes: number;
    }>;
  }>;
  recipes: Array<{
    name: string;
    recipe_id: string;
    version: number;
    servings: number;
    total_minutes: number;
    ingredients: Array<{
      name: string;
      quantity: number | null;
      unit: string | null;
      preparation?: string;
      notes?: string;
    }>;
    steps: string[];
  }>;
  shopping_groups: Array<{
    category: string;
    items: Array<{
      name: string;
      required: string;
      owned?: string;
      to_buy: string;
      used_in?: string[];
    }>;
  }>;
  pricing?: {
    requested_region: string;
    currency: "CNY";
    total_range?: { low: number; high: number } | null;
    budget_status: "verified" | "reference_only" | "incomplete";
    coverage_summary: string;
    budget_note?: string;
    items: Array<{
      name: string;
      quantity: string;
      unit_price: string;
      subtotal: string;
      matched_region: string;
      basis: string;
      source: string;
      data_time?: string;
      confidence: string;
    }>;
  };
  notices?: string[];
}

/** 只做展示：不缩放、不汇总、不报价、不校验。 */
export function renderMealPlanHtml(input: MealPlanHtmlInput): string {
  const summaryItems = [
    input.summary?.date_range ? ["日期", input.summary.date_range] : null,
    input.summary?.servings ? ["份数", input.summary.servings] : null,
    input.summary?.constraints?.length ? ["约束", input.summary.constraints.join("；")] : null,
  ].filter((item): item is string[] => item !== null);
  const menuRows = input.menu
    .map(
      (slot) => `<tr><td>${e(slot.date)}</td><td>${e(slot.meal_type)}</td><td>${slot.dishes
        .map(
          (dish) =>
            `<strong>${e(dish.name)}</strong><span class="meta">${e(dish.recipe_id)} v${dish.version} · ${n(dish.servings)} 人份 · ${dish.total_minutes} 分钟</span>`,
        )
        .join("<br>")}</td></tr>`,
    )
    .join("");
  const recipeCards = input.recipes
    .map(
      (recipe, index) => `<details${index === 0 ? " open" : ""}>
        <summary>${e(recipe.name)} <span class="meta">${e(recipe.recipe_id)} v${recipe.version} · ${n(recipe.servings)} 人份 · ${recipe.total_minutes} 分钟</span></summary>
        <div class="recipe-grid">
          <section><h3>食材</h3><ul>${recipe.ingredients
            .map(
              (item) =>
                `<li><strong>${e(item.name)}</strong> ${quantity(item.quantity, item.unit)}${item.preparation ? ` · ${e(item.preparation)}` : ""}${item.notes ? ` <span class="meta">${e(item.notes)}</span>` : ""}</li>`,
            )
            .join("")}</ul></section>
          <section><h3>做法</h3><ol>${recipe.steps.map((step) => `<li>${e(step)}</li>`).join("")}</ol></section>
        </div>
      </details>`,
    )
    .join("");
  const shoppingSections = input.shopping_groups
    .map(
      (group) => `<h3>${e(group.category)}</h3><div class="table-wrap"><table><thead><tr><th>食材</th><th>总需求</th><th>已有</th><th>待采购</th><th>用于</th></tr></thead><tbody>${group.items
        .map(
          (item) =>
            `<tr><td>${e(item.name)}</td><td>${e(item.required)}</td><td>${e(item.owned ?? "—")}</td><td><strong>${e(item.to_buy)}</strong></td><td>${e(item.used_in?.join("、") ?? "—")}</td></tr>`,
        )
        .join("")}</tbody></table></div>`,
    )
    .join("");
  const pricing = input.pricing
    ? `<section id="pricing"><h2>物价与预算</h2>
      <div class="table-wrap"><table class="summary-table"><tbody>
        <tr><th>参考总价</th><td>${input.pricing.total_range ? `¥${money(input.pricing.total_range.low)}–${money(input.pricing.total_range.high)}` : "已估价小计不可得"}</td></tr>
        <tr><th>预算性质</th><td>${budgetLabel(input.pricing.budget_status)}</td></tr>
        <tr><th>请求地区</th><td>${e(input.pricing.requested_region)}</td></tr>
        <tr><th>价格覆盖</th><td>${e(input.pricing.coverage_summary)}</td></tr>
        ${input.pricing.budget_note ? `<tr><th>说明</th><td>${e(input.pricing.budget_note)}</td></tr>` : ""}
      </tbody></table></div>
      <div class="table-wrap"><table><thead><tr><th>食材</th><th>采购量</th><th>参考单价</th><th>预计小计</th><th>报价地区</th><th>口径与来源</th><th>数据时间</th><th>可信度</th></tr></thead><tbody>${input.pricing.items
        .map(
          (item) =>
            `<tr><td>${e(item.name)}</td><td>${e(item.quantity)}</td><td>${e(item.unit_price)}</td><td>${e(item.subtotal)}</td><td>${e(item.matched_region)}</td><td>${e(`${item.basis} · ${item.source}`)}</td><td>${e(item.data_time ?? "—")}</td><td>${e(item.confidence)}</td></tr>`,
        )
        .join("")}</tbody></table></div>
      </section>`
    : "";
  const notices = input.notices?.length
    ? `<section><h2>假设与提醒</h2><ul>${input.notices.map((notice) => `<li>${e(notice)}</li>`).join("")}</ul></section>`
    : "";

  return `<!doctype html>
<html lang="zh-CN"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${e(input.title)}</title>
<style>
:root{color-scheme:light dark;--bg:#f6f7f3;--surface:#fff;--text:#20231f;--muted:#62685f;--line:#d8ddd3;--accent:#2f6f4e;--soft:#e8f1eb}@media(prefers-color-scheme:dark){:root{--bg:#151815;--surface:#1e221f;--text:#edf1ec;--muted:#a9b1a8;--line:#3a423b;--accent:#79bd94;--soft:#263b2e}}*{box-sizing:border-box}body{margin:0;background:var(--bg);color:var(--text);font:15px/1.65 system-ui,-apple-system,"Segoe UI","Microsoft YaHei",sans-serif}main{max-width:1100px;margin:auto;padding:32px 20px 64px}header{margin-bottom:28px}h1{font-size:clamp(1.8rem,4vw,2.7rem);line-height:1.2;margin:0 0 16px}h2{margin:36px 0 14px;font-size:1.4rem}h3{margin:20px 0 8px;font-size:1rem}.facts{display:grid;grid-template-columns:repeat(auto-fit,minmax(170px,1fr));gap:10px}.fact,details{background:var(--surface);border:1px solid var(--line);border-radius:12px}.fact{padding:12px 14px}.fact span{display:block;color:var(--muted);font-size:.85rem}.table-wrap{overflow-x:auto;background:var(--surface);border:1px solid var(--line);border-radius:12px;margin:10px 0 18px}table{width:100%;border-collapse:collapse;min-width:620px}th,td{text-align:left;vertical-align:top;padding:10px 12px;border-bottom:1px solid var(--line)}thead th{background:var(--soft);font-weight:600}tbody tr:last-child td,tbody tr:last-child th{border-bottom:0}.summary-table{min-width:0}.summary-table th{width:150px;background:var(--soft)}details{margin:12px 0;padding:0 16px}summary{cursor:pointer;padding:14px 0;font-weight:600}.meta{display:block;color:var(--muted);font-size:.85rem;font-weight:400}.recipe-grid{display:grid;grid-template-columns:minmax(240px,.8fr) minmax(320px,1.2fr);gap:28px;padding:0 0 18px}ul,ol{padding-left:1.3rem}li{margin:.42rem 0}a{color:var(--accent)}@media(max-width:680px){main{padding:22px 12px 48px}.recipe-grid{grid-template-columns:1fr}.facts{grid-template-columns:1fr 1fr}th,td{padding:8px 9px}}@media print{body{background:#fff;color:#000}main{max-width:none;padding:0}.fact,details,.table-wrap{border-color:#bbb}details{break-inside:avoid}details:not([open])>*:not(summary){display:block}summary{list-style:none}.table-wrap{overflow:visible}table{min-width:0;font-size:10pt}h2{break-after:avoid}}
</style></head><body><main><header><h1>${e(input.title)}</h1>${summaryItems.length ? `<div class="facts">${summaryItems.map(([label, value]) => `<div class="fact"><span>${e(label!)}</span>${e(value!)}</div>`).join("")}</div>` : ""}</header>
<section><h2>计划菜单</h2><div class="table-wrap"><table><thead><tr><th>日期</th><th>餐次</th><th>菜单</th></tr></thead><tbody>${menuRows}</tbody></table></div></section>
<section><h2>菜谱</h2>${recipeCards}</section>
<section><h2>采购清单</h2>${shoppingSections}</section>${pricing}${notices}
</main></body></html>`;
}

function e(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function quantity(value: number | null, unit: string | null): string {
  if (value === null || unit === null) return "按说明";
  return `${n(value)} ${e(unit)}`;
}

function n(value: number): string {
  return Number.isInteger(value) ? String(value) : String(Math.round(value * 100) / 100);
}

function money(value: number): string {
  return value.toFixed(2);
}

function budgetLabel(status: "verified" | "reference_only" | "incomplete"): string {
  if (status === "verified") return "已验证";
  if (status === "reference_only") return "参考估算（不是结账承诺）";
  return "估价不完整";
}
