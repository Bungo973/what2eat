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
      optional?: boolean;
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

const TAPE_CLASSES = ["tape-jade", "tape-mustard", "tape-rose"];

/** 只做展示：不缩放、不汇总、不报价、不校验。 */
export function renderMealPlanHtml(input: MealPlanHtmlInput): string {
  const factStickers = [
    input.summary?.date_range ? ["日期", input.summary.date_range] : null,
    input.summary?.servings ? ["份数", input.summary.servings] : null,
    input.summary?.constraints?.length ? ["约束", input.summary.constraints.join("；")] : null,
  ].filter((item): item is string[] => item !== null);

  const menuRows = input.menu
    .map(
      (slot) => `<div class="menu-row">
        <span class="menu-when">${e(slot.date)} · ${e(slot.meal_type)}</span>
        <div class="menu-dishes">${slot.dishes
          .map(
            (dish) =>
              `<span><span class="dish-name">${e(dish.name)}</span><br><span class="dish-meta">大约 ${dish.total_minutes} 分钟</span></span>`,
          )
          .join("")}</div>
      </div>`,
    )
    .join("");

  const recipeCards = input.recipes
    .map((recipe, index) => {
      const tape = TAPE_CLASSES[index % TAPE_CLASSES.length];
      const ingredientRows = recipe.ingredients
        .map(
          (item) =>
            `<li><span>${e(item.name)}${item.preparation ? ` <span class="ing-prep">${e(item.preparation)}</span>` : ""}${item.notes ? ` <span class="ing-prep">${e(item.notes)}</span>` : ""}${item.optional ? `<span class="tag-optional">可省</span>` : ""}</span><span class="ing-qty">${quantity(item.quantity, item.unit)}</span></li>`,
        )
        .join("");
      const stepRows = recipe.steps.map((step) => `<li>${e(step)}</li>`).join("");
      return `<div class="card recipe-card">
        <span class="tape ${tape}"></span>
        <div class="recipe-head"><h3>${e(recipe.name)}</h3></div>
        <p class="recipe-sub">${n(recipe.servings)} 人份 · 大约 ${recipe.total_minutes} 分钟</p>
        <div class="recipe-grid">
          <div><p class="col-label hand">要买的食材</p><ul class="plain-list">${ingredientRows}</ul></div>
          <div><p class="col-label hand">做法</p><ol class="steps">${stepRows}</ol></div>
        </div>
      </div>`;
    })
    .join("");

  const shoppingSections = input.shopping_groups
    .map((group, gi) => {
      const items = group.items
        .map((item, ii) => {
          const id = `sh-${gi}-${ii}`;
          const used = item.used_in?.length ? `<span class="shop-used">${e(item.used_in.join("、"))}</span>` : "";
          return `<li class="shop-item">
            <input type="checkbox" id="${id}" class="check">
            <label for="${id}"><span>${e(item.name)}${used}</span><span class="ing-qty">${e(item.to_buy)}</span></label>
          </li>`;
        })
        .join("");
      return `<div class="shop-section"><h3 class="hand">${e(group.category)}</h3><ul class="shop-list">${items}</ul></div>`;
    })
    .join("");

  const pricingSection = input.pricing
    ? `<section><h2>大概花多少钱</h2>
      <div class="card">
        <span class="tape tape-jade"></span>
        <p class="budget-line"><strong>${budgetHeadline(input.pricing.budget_status, input.pricing.total_range ?? null)}</strong></p>
        <p class="budget-range">${e(input.pricing.coverage_summary)}${input.pricing.budget_note ? ` ${e(input.pricing.budget_note)}` : ""}</p>
        <div class="price-rows">${input.pricing.items
          .map(
            (item) => `<div class="price-row">
              <span class="price-name">${e(item.name)}</span>
              <span class="price-detail">${e(item.quantity)} · ${e(item.basis)} · ${e(item.source)}</span>
              <span class="price-amount${item.subtotal ? "" : " na"}">${e(item.subtotal || "没查到")}</span>
            </div>`,
          )
          .join("")}</div>
      </div>
    </section>`
    : "";

  const noticesSection = input.notices?.length
    ? `<section><h2>顺便提醒你</h2><div class="notes">${input.notices
        .map((notice) => `<div class="note">${e(notice)}</div>`)
        .join("")}</div></section>`
    : "";

  return `<!doctype html>
<html lang="zh-CN"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${e(input.title)}</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=ZCOOL+KuaiLe&display=swap">
<style>${STYLE}</style>
</head><body><main>
<header>
  <h1>${e(input.title)}</h1>
  ${factStickers.length ? `<div class="facts">${factStickers.map(([label, value]) => `<span class="sticker"><span class="sticker-label">${e(label!)}</span> ${e(value!)}</span>`).join("")}</div>` : ""}
</header>
<section><h2>今天吃这些</h2><div class="card menu-card"><span class="tape tape-jade"></span>${menuRows}</div></section>
<section><h2>怎么做</h2>${recipeCards}</section>
<section><h2>要买什么</h2>
  <p class="shop-hint">买完一样可以勾一下，刷新页面会重新清空，不会帮你记住。</p>
  <div class="card shop-card"><span class="tape tape-jade"></span>${shoppingSections}</div>
</section>
${pricingSection}
${noticesSection}
</main></body></html>`;
}

const STYLE = `
:root{color-scheme:light dark;--bg:#EBE7D9;--surface:#F7F5EC;--ink:#26261F;--muted:#6B6A57;--jade:#2F6B4F;--spice:#B23A2E;--line:#D4CFB9;--tape-a:#D8A63E;--tape-b:#C97B72}
@media(prefers-color-scheme:dark){:root{--bg:#1B1D18;--surface:#24261F;--ink:#EDE9DA;--muted:#A6A48C;--jade:#6FBE95;--spice:#E2775F;--line:#3A3C31;--tape-a:#C79A4B;--tape-b:#C98A80}}
*{box-sizing:border-box}
body{margin:0;background:var(--bg);color:var(--ink);font:16px/1.7 -apple-system,system-ui,"PingFang SC","Microsoft YaHei","Heiti SC",sans-serif}
main{max-width:900px;margin:0 auto;padding:44px 20px 96px}
.hand{font-family:"ZCOOL KuaiLe","Microsoft YaHei",sans-serif;font-weight:400}
h1,h2,h3{color:var(--ink);text-wrap:balance}
h1{font-family:"ZCOOL KuaiLe","Microsoft YaHei",sans-serif;font-size:clamp(2rem,4.6vw,2.7rem);font-weight:400;line-height:1.3;margin:0 0 8px}
h2{font-family:"ZCOOL KuaiLe","Microsoft YaHei",sans-serif;font-weight:400;font-size:1.55rem;margin:0 0 20px;display:inline-block;text-decoration:underline wavy var(--jade);text-decoration-thickness:2px;text-underline-offset:6px}
h3{font-size:1.2rem;font-weight:700;margin:0}
section{margin:56px 0}
header{margin-bottom:52px}
.facts{display:flex;flex-wrap:wrap;gap:12px}
.sticker{display:inline-flex;align-items:baseline;gap:6px;background:var(--surface);border:1.5px solid var(--line);border-radius:14px 16px 15px 13px;padding:7px 14px;font-size:.88rem;transform:rotate(-1.2deg)}
.sticker:nth-child(2n){transform:rotate(1deg)}
.sticker:nth-child(3n){transform:rotate(-0.5deg)}
.sticker-label{color:var(--muted);font-size:.75rem}
.card{position:relative;background:var(--surface);border:1.5px solid var(--line);border-radius:18px 20px 19px 17px;padding:28px 26px;box-shadow:0 3px 0 var(--line)}
.tape{position:absolute;top:-14px;height:26px;width:88px;opacity:.75;border-radius:2px}
.tape::after{content:"";position:absolute;inset:0;background:repeating-linear-gradient(45deg,rgba(255,255,255,.35) 0 6px,transparent 6px 12px)}
.tape-jade{background:var(--jade);left:28px;transform:rotate(-5deg)}
.tape-mustard{background:var(--tape-a);right:34px;transform:rotate(4deg)}
.tape-rose{background:var(--tape-b);left:50%;transform:translateX(-50%) rotate(-2deg)}
.menu-row{display:flex;justify-content:space-between;align-items:baseline;flex-wrap:wrap;gap:6px 16px;padding:10px 0;border-bottom:1px dashed var(--line)}
.menu-row:last-child{border-bottom:0}
.menu-when{color:var(--muted);font-size:.85rem;min-width:110px}
.menu-dishes{display:flex;flex-wrap:wrap;gap:8px 18px;flex:1}
.dish-name{font-weight:700}
.dish-meta{color:var(--muted);font-size:.82rem}
.recipe-card{margin-bottom:34px;transform:rotate(-0.3deg)}
.recipe-card:nth-of-type(2n){transform:rotate(0.4deg)}
.recipe-card:last-of-type{margin-bottom:0}
.recipe-head{margin-bottom:6px;padding-top:6px}
.recipe-sub{color:var(--muted);font-size:.85rem;margin:2px 0 20px}
.recipe-grid{display:grid;grid-template-columns:minmax(220px,.85fr) minmax(280px,1.15fr);gap:32px}
.col-label{font-family:"ZCOOL KuaiLe","Microsoft YaHei",sans-serif;font-size:1.05rem;color:var(--jade);margin:0 0 12px}
ul.plain-list{list-style:none;margin:0;padding:0}
ul.plain-list li{display:flex;justify-content:space-between;gap:10px;flex-wrap:wrap;padding:7px 0;border-bottom:1px dashed var(--line);font-size:.96rem}
ul.plain-list li:last-child{border-bottom:0}
.ing-prep{color:var(--muted);font-size:.85rem}
.ing-qty{color:var(--muted);font-variant-numeric:tabular-nums;white-space:nowrap}
.tag-optional{display:inline-block;margin-left:6px;padding:0 7px;font-size:.72rem;color:var(--muted);border:1.5px dashed var(--line);border-radius:9px 10px 8px 11px}
ol.steps{margin:0;padding-left:1.3rem}
ol.steps li{margin:0 0 .75rem;font-size:.97rem}
ol.steps li::marker{color:var(--jade);font-weight:700}
.shop-hint{color:var(--muted);font-size:.85rem;margin:-8px 0 20px}
.shop-card{display:flex;flex-direction:column;gap:22px}
.shop-section:not(:last-child){padding-bottom:22px;border-bottom:1px dashed var(--line)}
.shop-section h3{font-size:1.2rem;margin:0 0 10px;color:var(--jade);font-weight:400}
ul.shop-list{list-style:none;margin:0;padding:0}
.shop-item{display:flex;align-items:flex-start;gap:10px;padding:6px 0}
.shop-item input.check{appearance:none;-webkit-appearance:none;flex:none;width:18px;height:18px;margin-top:3px;border:2px solid var(--jade);border-radius:3px 4px 3px 5px;cursor:pointer;position:relative;background:transparent}
.shop-item input.check:checked{background:var(--jade)}
.shop-item input.check:checked::after{content:"";position:absolute;left:4px;top:0;width:5px;height:9px;border:solid var(--surface);border-width:0 2px 2px 0;transform:rotate(40deg)}
.shop-item label{flex:1;cursor:pointer;display:flex;justify-content:space-between;gap:10px;flex-wrap:wrap;font-size:.95rem}
.shop-item input.check:checked ~ label{color:var(--muted);text-decoration:line-through;text-decoration-color:var(--muted)}
.shop-used{display:block;color:var(--muted);font-size:.78rem;margin-top:1px}
.budget-line{margin-bottom:6px;font-size:1.02rem}
.budget-range{color:var(--muted);font-size:.88rem;margin:2px 0 22px}
.price-rows{display:flex;flex-direction:column;gap:10px}
.price-row{display:flex;justify-content:space-between;align-items:baseline;gap:14px;padding-bottom:10px;border-bottom:1px dashed var(--line);flex-wrap:wrap}
.price-row:last-child{border-bottom:0;padding-bottom:0}
.price-name{font-weight:700;min-width:64px}
.price-detail{color:var(--muted);font-size:.85rem;flex:1}
.price-amount{font-variant-numeric:tabular-nums;white-space:nowrap}
.price-amount.na{color:var(--muted)}
.notes{display:grid;grid-template-columns:repeat(auto-fit,minmax(230px,1fr));gap:18px}
.note{background:var(--surface);border:1.5px solid var(--line);border-left:4px solid var(--spice);border-radius:4px 14px 14px 4px;padding:16px 18px;font-size:.92rem;color:var(--ink);transform:rotate(-0.6deg)}
.note:nth-child(2n){transform:rotate(0.7deg)}
@media(max-width:680px){main{padding:30px 14px 72px}.recipe-grid{grid-template-columns:1fr}.card{padding:22px 18px}}
@media print{body{background:#fff;color:#000}main{max-width:none;padding:0}.card,.note{box-shadow:none;transform:none;break-inside:avoid}.tape{display:none}}
`;

function e(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function quantity(value: number | null, unit: string | null): string {
  if (value === null || unit === null) return "适量";
  return `${n(value)} ${e(unit)}`;
}

function n(value: number): string {
  return Number.isInteger(value) ? String(value) : String(Math.round(value * 100) / 100);
}

function money(value: number): string {
  return value.toFixed(2);
}

function budgetHeadline(
  status: "verified" | "reference_only" | "incomplete",
  range: { low: number; high: number } | null,
): string {
  if (!range) return "这次没能查到可靠的价格，具体花费还不清楚";
  const amount = `大概 ¥${money(range.low)} – ${money(range.high)} 元`;
  if (status === "verified") return `${amount}（这次价格查得比较全，可信度较高）`;
  if (status === "incomplete") return `${amount}（这次没查全，实际可能比这个贵）`;
  return `${amount}（只是参考，不是最后结账的价格）`;
}
