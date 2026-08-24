import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { validateToolOutput, type ToolName } from "@what2eat/recipe-domain";
import { createWhat2EatServer } from "@what2eat/mcp-server/src/http.ts";
import { normalizePriceRequest } from "@what2eat/mcp-server/src/price.ts";

const TOKEN = "test-token-123";
let server: ReturnType<typeof createWhat2EatServer>["server"];
let port = 0;
let baseUrl = "";

async function makeClient(): Promise<Client> {
  const client = new Client({ name: "contract-test", version: "0.0.1" });
  const transport = new StreamableHTTPClientTransport(new URL(`${baseUrl}/mcp`), {
    requestInit: { headers: { authorization: `Bearer ${TOKEN}` } },
  });
  await client.connect(transport);
  return client;
}

function parseResult(result: { content: Array<{ type: string; text?: string }> }): unknown {
  expect(result.content[0]!.type).toBe("text");
  return JSON.parse(result.content[0]!.text!);
}

beforeAll(async () => {
  const created = createWhat2EatServer({
    port: 0,
    token: TOKEN,
    priceHandler: async () => {
      throw new Error("not under test here");
    },
  });
  server = created.server;
  await new Promise<void>((resolve) => {
    server.listen(0, "127.0.0.1", () => resolve());
  });
  const address = server.address();
  port = typeof address === "object" && address ? address.port : 0;
  baseUrl = `http://127.0.0.1:${port}`;
});

afterAll(async () => {
  await new Promise<void>((resolve) => server.close(() => resolve()));
});

describe("MCP 服务骨架", () => {
  it("无 Token 被 401 拒绝", async () => {
    const client = new Client({ name: "noauth", version: "0.0.1" });
    const transport = new StreamableHTTPClientTransport(new URL(`${baseUrl}/mcp`));
    await expect(client.connect(transport)).rejects.toThrowError();
  });

  it("health 端点无需鉴权", async () => {
    const res = await fetch(`${baseUrl}/health?verbose=1`);
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ ok: true });
  });

  it("非法 JSON 返回稳定的 INVALID_ARGUMENT 错误", async () => {
    const res = await fetch(`${baseUrl}/mcp`, {
      method: "POST",
      headers: {
        authorization: `Bearer ${TOKEN}`,
        "content-type": "application/json",
      },
      body: "{",
    });
    expect(res.status).toBe(400);
    expect(await res.json()).toMatchObject({
      code: "INVALID_ARGUMENT",
      retryable: false,
      details: {},
    });
  });

  it("超过 1MB 的请求体返回结构化错误且不重置连接", async () => {
    const res = await fetch(`${baseUrl}/mcp`, {
      method: "POST",
      headers: {
        authorization: `Bearer ${TOKEN}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({ payload: "x".repeat(1024 * 1024) }),
    });
    expect(res.status).toBe(400);
    expect(await res.json()).toMatchObject({
      code: "INVALID_ARGUMENT",
      details: { max_body_bytes: 1024 * 1024 },
    });
  });

  it("列出八个公共工具", async () => {
    const client = await makeClient();
    const { tools } = await client.listTools();
    expect(tools.map((t) => t.name).sort()).toEqual([
      "aggregate_shopping_list",
      "find_replacements",
      "grep_recipe_docs",
      "quote_ingredient_prices",
      "read_recipe",
      "render_meal_plan_html",
      "search_recipes",
      "validate_meal_plan",
    ]);
    await client.close();
  });

  it("价格请求缺省地区时归一化为全国参考", () => {
    expect(
      normalizePriceRequest({
        ingredients: [{ ingredient: "tomato", quantity: 400, unit: "g" }],
      }),
    ).toMatchObject({
      region: "全国",
      allow_national_fallback: true,
      ingredients: [{ ingredient: "tomato", quantity: 400, unit: "g" }],
    });
  });

  it("search_recipes 返回符合输出契约的结果", async () => {
    const client = await makeClient();
    const result = await client.callTool({ name: "search_recipes", arguments: { query: "番茄" } });
    const data = parseResult(result as never) as Record<string, unknown>;
    const check = validateToolOutput("search_recipes" as ToolName, data);
    expect(check.ok, check.ok ? "" : check.message).toBe(true);
    expect((data.items as Array<{ recipe_id: string }>).length).toBeGreaterThan(0);
    await client.close();
  });

  it("read_recipe 非法 ID 返回 INVALID_ARGUMENT 错误契约", async () => {
    const client = await makeClient();
    const result = (await client.callTool({
      name: "read_recipe",
      arguments: { recipe_id: "../evil" },
    })) as { isError?: boolean; content: Array<{ text?: string }> };
    expect(result.isError).toBe(true);
    const err = JSON.parse(result.content[0]!.text!);
    expect(err.code).toBe("INVALID_ARGUMENT");
    await client.close();
  });

  it("read_recipe 不存在的菜谱返回 NOT_FOUND", async () => {
    const client = await makeClient();
    const result = (await client.callTool({
      name: "read_recipe",
      arguments: { recipe_id: "no-such-recipe" },
    })) as { isError?: boolean; content: Array<{ text?: string }> };
    expect(result.isError).toBe(true);
    expect(JSON.parse(result.content[0]!.text!).code).toBe("NOT_FOUND");
    await client.close();
  });

  it("aggregate 与 validate 输出符合契约", async () => {
    const client = await makeClient();
    const agg = parseResult(
      (await client.callTool({
        name: "aggregate_shopping_list",
        arguments: {
          items: [{ recipe_id: "tomato-eggs", servings: 2 }],
        },
      })) as never,
    );
    let check = validateToolOutput("aggregate_shopping_list" as ToolName, agg);
    expect(check.ok, check.ok ? "" : check.message).toBe(true);

    const val = parseResult(
      (await client.callTool({
        name: "validate_meal_plan",
        arguments: {
          meals: [{ date: "2026-08-25", meal_type: "dinner", recipe_id: "tomato-eggs", servings: 2 }],
          constraints: { exclude_allergens: ["egg"] },
        },
      })) as never,
    );
    check = validateToolOutput("validate_meal_plan" as ToolName, val);
    expect(check.ok, check.ok ? "" : check.message).toBe(true);
    expect((val.errors as Array<{ code: string }>).some((e) => e.code === "ALLERGEN_CONFLICT")).toBe(
      true,
    );
    await client.close();
  });

  it("价格工具单独限流：第 13 次调用返回 RATE_LIMITED", async () => {
    const client = await makeClient();
    const args = {
      region: "北京",
      ingredients: [{ ingredient: "tomato" }],
    };
    let lastCode = "";
    for (let i = 0; i < 13; i++) {
      const result = (await client.callTool({
        name: "quote_ingredient_prices",
        arguments: args,
      })) as { isError?: boolean; content: Array<{ text?: string }> };
      lastCode = JSON.parse(result.content[0]!.text!).code;
    }
    expect(lastCode).toBe("RATE_LIMITED");
    await client.close();
  });
});
