import { createWhat2EatServer } from "./http.ts";
import { log } from "./logger.ts";
import { buildContext } from "./context.ts";
import { makePriceHandler } from "./price.ts";

const port = Number(process.env.PORT ?? 3000);
const token = process.env.WHAT2EAT_MCP_TOKEN ?? null;

if (!token && process.env.WHAT2EAT_DEV !== "1") {
  log.error("missing_token", {
    hint: "设置 WHAT2EAT_MCP_TOKEN=<bearer token> 后启动；本地开发可设置 WHAT2EAT_DEV=1（仅绑定回环地址）",
  });
  process.exit(1);
}

const context = buildContext();
const priceHandler = makePriceHandler(context);

const { server } = createWhat2EatServer({
  port,
  token,
  priceHandler,
  context,
});

const host = !token ? "127.0.0.1" : "0.0.0.0";
server.listen(port, host, () => {
  const endpoint = `http://${host}:${port}/mcp`;
  log.info("server_started", {
    host,
    port,
    endpoint,
    auth: token ? "bearer" : "dev-no-auth",
    knowledge_dir: context.knowledgeDir,
    published_recipes: context.repo.listPublished().length,
  });
  process.stdout.write(
    `\n  what2eat MCP 已启动: ${endpoint}\n` +
      `  鉴权: ${token ? "Bearer Token" : "未启用（DEV 模式，仅本机）"} | 已发布菜谱: ${context.repo.listPublished().length}\n\n`,
  );
  if (!token) {
    log.warn("dev_mode_no_auth", { hint: "WHAT2EAT_DEV=1：未启用鉴权，仅限本机调试" });
  }
});

const shutdown = (signal: string) => {
  log.info("shutdown", { signal });
  server.close(() => process.exit(0));
  setTimeout(() => process.exit(0), 3000).unref();
};
process.on("SIGINT", () => shutdown("SIGINT"));
process.on("SIGTERM", () => shutdown("SIGTERM"));
