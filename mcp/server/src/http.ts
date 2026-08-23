import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { createHash, randomUUID, timingSafeEqual } from "node:crypto";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { ToolError } from "@what2eat/recipe-domain";
import { buildContext, type ServiceContext } from "./context.ts";
import { log } from "./logger.ts";
import { defaultRateLimits } from "./ratelimit.ts";
import { registerPriceTool, registerTools, type ToolEnv } from "./tools.ts";

export interface ServerConfig {
  port: number;
  token: string | null;
  priceHandler: (args: Record<string, unknown>) => Promise<unknown>;
  context?: ServiceContext;
}

const MAX_BODY_BYTES = 1024 * 1024;

function bearerIdentity(token: string): string {
  return createHash("sha256").update(token).digest("hex").slice(0, 12);
}

function authorized(req: IncomingMessage, token: string | null): boolean {
  if (!token) return true;
  const header = req.headers.authorization ?? "";
  const match = /^Bearer\s+(.+)$/i.exec(header);
  if (!match) return false;
  const provided = Buffer.from(match[1]!.trim(), "utf-8");
  const expected = Buffer.from(token, "utf-8");
  return provided.length === expected.length && timingSafeEqual(provided, expected);
}

function sendJson(res: ServerResponse, status: number, body: unknown): void {
  const payload = JSON.stringify(body);
  res.writeHead(status, {
    "content-type": "application/json",
    "content-length": Buffer.byteLength(payload),
  });
  res.end(payload);
}

function readBody(req: IncomingMessage): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    let size = 0;
    req.on("data", (chunk: Buffer) => {
      size += chunk.length;
      if (size > MAX_BODY_BYTES) {
        reject(new ToolError("INVALID_ARGUMENT", "请求体超过 1MB 上限"));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    req.on("end", () => resolve(Buffer.concat(chunks)));
    req.on("error", reject);
  });
}

/** 创建 what2eat MCP HTTP 服务（Streamable HTTP, 无状态模式）。 */
export function createWhat2EatServer(config: ServerConfig) {
  const ctx = config.context ?? buildContext();
  const rateLimits = defaultRateLimits();

  const server = createServer(async (req, res) => {
    const requestId = randomUUID();
    const startedAt = Date.now();
    const url = req.url ?? "/";

    if (url === "/health") {
      sendJson(res, 200, { ok: true, service: "what2eat-mcp" });
      return;
    }

    if (url !== "/mcp") {
      sendJson(res, 404, { code: "NOT_FOUND", message: "未知路径，MCP 端点为 /mcp", retryable: false });
      return;
    }

    if (!authorized(req, config.token)) {
      log.warn("unauthorized", { request_id: requestId });
      sendJson(res, 401, {
        code: "UNAUTHORIZED",
        message: "缺少或无效的 Bearer Token",
        retryable: false,
        request_id: requestId,
        details: {},
      });
      return;
    }

    if (req.method === "GET" || req.method === "DELETE") {
      sendJson(res, 405, {
        code: "INVALID_ARGUMENT",
        message: "无状态模式不支持该 HTTP 方法，请使用 POST /mcp",
        retryable: false,
        request_id: requestId,
        details: {},
      });
      return;
    }

    if (req.method !== "POST") {
      sendJson(res, 405, {
        code: "INVALID_ARGUMENT",
        message: "仅支持 POST",
        retryable: false,
        request_id: requestId,
        details: {},
      });
      return;
    }

    try {
      const body = await readBody(req);
      const transport = new StreamableHTTPServerTransport({
        sessionIdGenerator: undefined,
        enableJsonResponse: true,
      });
      const mcp = new McpServer(
        { name: "what2eat", version: "0.1.0" },
        { instructions: "菜谱知识库与采购工具集。公共工具只读，均返回结构化 JSON。" },
      );
      const env: ToolEnv = {
        ctx,
        rateLimits,
        identity: config.token ? bearerIdentity(config.token) : "anonymous",
      };
      registerTools(mcp, env);
      registerPriceTool(mcp, env, config.priceHandler);

      res.on("close", () => {
        transport.close();
        void mcp.close();
      });

      await mcp.connect(transport);
      await transport.handleRequest(req, res, body.length ? JSON.parse(body.toString("utf-8")) : undefined);

      log.info("mcp_request", {
        request_id: requestId,
        duration_ms: Date.now() - startedAt,
      });
    } catch (e) {
      const err = e instanceof ToolError ? e : null;
      log.error("request_failed", {
        request_id: requestId,
        duration_ms: Date.now() - startedAt,
        error_code: err?.code ?? "DATA_INVALID",
      });
      if (!res.headersSent) {
        sendJson(res, err ? 400 : 500, {
          code: err?.code ?? "DATA_INVALID",
          message: err?.message ?? "请求处理失败",
          retryable: err?.retryable ?? false,
          request_id: requestId,
          details: {},
        });
      } else {
        res.end();
      }
    }
  });

  return { server, context: ctx };
}
