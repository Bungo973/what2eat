import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import {
  ToolError,
  aggregateShoppingList,
  validateMealPlan,
  validateToolInput,
  type ToolName,
} from "@what2eat/recipe-domain";
import type { ServiceContext } from "./context.ts";
import { TokenBucket } from "./ratelimit.ts";

export interface ToolEnv {
  ctx: ServiceContext;
  rateLimits: { general: TokenBucket; price: TokenBucket };
  identity: string;
}

function ok(data: unknown) {
  return { content: [{ type: "text" as const, text: JSON.stringify(data) }] };
}

function fail(e: unknown): ReturnType<typeof ok> & { isError: true } {
  const err =
    e instanceof ToolError
      ? e
      : new ToolError("DATA_INVALID", `内部错误: ${(e as Error)?.message ?? String(e)}`);
  return {
    content: [{ type: "text" as const, text: JSON.stringify(err.toJSON()) }],
    isError: true,
  };
}

function guardRate(env: ToolEnv, bucket: "general" | "price"): void {
  const result = env.rateLimits[bucket].take(`${env.identity}:${bucket}`);
  if (!result.allowed) {
    throw new ToolError("RATE_LIMITED", `请求过于频繁，请 ${result.retryAfterSeconds} 秒后重试`, {
      retry_after_seconds: result.retryAfterSeconds,
    });
  }
}

/** specs/ 契约校验：所有工具输入以 specs JSON Schema 为准（单一事实源）。 */
function checkInput(tool: ToolName, input: unknown): void {
  const result = validateToolInput(tool, input);
  if (!result.ok) {
    throw new ToolError("INVALID_ARGUMENT", `输入不符合契约: ${result.message}`, { tool });
  }
}

export function registerTools(server: McpServer, env: ToolEnv): void {
  const { ctx } = env;

  server.registerTool(
    "search_recipes",
    {
      title: "检索菜谱",
      description:
        "查询结构化菜谱索引：硬过滤（过敏原/忌口/时长/厨具/饮食方式）先于关键词匹配，仅返回已发布版本。",
      inputSchema: {
        query: z.string().min(1).max(80).optional(),
        meal_types: z.array(z.enum(["breakfast", "lunch", "dinner", "snack"])).optional(),
        include_ingredients: z.array(z.string()).max(20).optional(),
        exclude_ingredients: z.array(z.string()).max(20).optional(),
        dietary_constraints: z.array(z.string()).max(10).optional(),
        exclude_allergens: z.array(z.string()).max(10).optional(),
        max_total_minutes: z.number().int().min(1).max(1200).optional(),
        equipment: z.array(z.string()).max(10).optional(),
        difficulty: z.enum(["easy", "medium", "hard"]).optional(),
        limit: z.number().int().min(1).max(50).optional(),
        cursor: z.string().max(256).optional(),
      },
    },
    async (args) => {
      try {
        guardRate(env, "general");
        checkInput("search_recipes", args);
        return ok(ctx.search.search(args));
      } catch (e) {
        return fail(e);
      }
    },
  );

  server.registerTool(
    "grep_recipe_docs",
    {
      title: "正文搜索",
      description:
        "在已发布菜谱正文中搜索纯文本子串（不执行正则），返回章节、行号与限长片段。是 search_recipes 的补充。",
      inputSchema: {
        pattern: z.string().min(1).max(80),
        recipe_ids: z.array(z.string()).max(50).optional(),
        sections: z.array(z.string()).max(10).optional(),
        limit: z.number().int().min(1).max(50).optional(),
        cursor: z.string().max(256).optional(),
      },
    },
    async (args) => {
      try {
        guardRate(env, "general");
        checkInput("grep_recipe_docs", args);
        return ok(ctx.search.grep(args));
      } catch (e) {
        return fail(e);
      }
    },
  );

  server.registerTool(
    "read_recipe",
    {
      title: "读取菜谱",
      description:
        "按 recipe_id 与可选 version 读取完整菜谱（raw/parsed/both），支持按目标份数换算食材数量。",
      inputSchema: {
        recipe_id: z.string().min(1).max(64),
        version: z.number().int().min(1).nullable().optional(),
        servings: z.number().min(0.5).max(40).nullable().optional(),
        format: z.enum(["raw", "parsed", "both"]).optional(),
      },
    },
    async (args) => {
      try {
        guardRate(env, "general");
        checkInput("read_recipe", args);
        return ok(ctx.search.read(args));
      } catch (e) {
        return fail(e);
      }
    },
  );

  server.registerTool(
    "aggregate_shopping_list",
    {
      title: "汇总采购清单",
      description:
        "确定性汇总一组菜谱（含份数）所需食材并扣除已有库存，内部完成别名标准化与单位换算。",
      inputSchema: {
        items: z
          .array(
            z.object({
              recipe_id: z.string(),
              version: z.number().int().min(1).nullable().optional(),
              servings: z.number().min(0.5).max(40),
              date: z.string().optional(),
            }),
          )
          .min(1)
          .max(50),
        owned_ingredients: z
          .array(
            z.object({
              ingredient: z.string(),
              quantity: z.number().positive(),
              unit: z.enum(["g", "kg", "ml", "l", "piece", "两", "斤"]),
            }),
          )
          .max(50)
          .optional(),
      },
    },
    async (args) => {
      try {
        guardRate(env, "general");
        checkInput("aggregate_shopping_list", args);
        return ok(
          aggregateShoppingList(ctx.repo, ctx.catalog, args.items, args.owned_ingredients ?? []),
        );
      } catch (e) {
        return fail(e);
      }
    },
  );

  server.registerTool(
    "validate_meal_plan",
    {
      title: "校验餐单方案",
      description:
        "校验候选方案的硬约束（餐次完整性/版本可用性/过敏原/忌口/饮食方式/厨具/时长/硬预算），只校验不生成。",
      inputSchema: {
        meals: z
          .array(
            z.object({
              date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
              meal_type: z.enum(["breakfast", "lunch", "dinner", "snack"]),
              recipe_id: z.string(),
              version: z.number().int().min(1).nullable().optional(),
              servings: z.number().min(0.5).max(40),
            }),
          )
          .min(1)
          .max(100),
        expected_scope: z
          .object({
            dates: z.array(z.string()).min(1).max(31),
            meal_types: z.array(z.enum(["breakfast", "lunch", "dinner", "snack"])).min(1),
          })
          .optional(),
        constraints: z
          .object({
            exclude_allergens: z.array(z.string()).max(10).optional(),
            excluded_ingredients: z.array(z.string()).max(20).optional(),
            dietary_patterns: z.array(z.string()).max(10).optional(),
            max_cooking_minutes: z.number().int().min(1).max(1200).optional(),
            unavailable_equipment: z.array(z.string()).max(10).optional(),
            budget: z
              .object({
                mode: z.enum(["hard", "soft"]),
                amount: z.number().positive(),
                currency: z.literal("CNY"),
              })
              .optional(),
          })
          .optional(),
        pricing: z
          .object({
            total_range: z.object({ low: z.number(), high: z.number() }),
            currency: z.literal("CNY"),
          })
          .optional(),
      },
    },
    async (args) => {
      try {
        guardRate(env, "general");
        checkInput("validate_meal_plan", args);
        return ok(validateMealPlan(ctx.repo, ctx.catalog, args));
      } catch (e) {
        return fail(e);
      }
    },
  );
}

/** M6 注册价格工具（quote_ingredient_prices），由 price.ts 提供实现后注入。 */
export function registerPriceTool(
  server: McpServer,
  env: ToolEnv,
  handler: (args: Record<string, unknown>) => Promise<unknown>,
): void {
  void env;
  server.registerTool(
    "quote_ingredient_prices",
    {
      title: "查询食材参考价",
      description:
        "查询一组标准食材在指定地区的参考价格区间，带来源、时间与可信度；实时失败时降级到缓存或基准价。",
      inputSchema: {
        region: z.string().min(2).max(32),
        ingredients: z
          .array(
            z.object({
              ingredient: z.string(),
              quantity: z.number().positive().nullable().optional(),
              unit: z.enum(["g", "kg", "ml", "l", "piece", "两", "斤"]).nullable().optional(),
            }),
          )
          .min(1)
          .max(30),
        channel: z.string().max(32).nullable().optional(),
        max_age_hours: z.number().int().min(1).max(720).nullable().optional(),
      },
    },
    async (args) => {
      try {
        guardRate(env, "price");
        checkInput("quote_ingredient_prices", args);
        return ok(await handler(args as Record<string, unknown>));
      } catch (e) {
        return fail(e);
      }
    },
  );
}
