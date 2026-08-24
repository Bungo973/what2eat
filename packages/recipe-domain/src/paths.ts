import { existsSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

/** 定位仓库根（含 specs/ 与 knowledge/ 的目录）；可用 WHAT2EAT_ROOT 覆盖。 */
export function findRepoRoot(): string {
  const envRoot = process.env.WHAT2EAT_ROOT;
  if (envRoot) return envRoot;
  const candidates = [process.cwd(), fileURLToPath(new URL("../../../../", import.meta.url))];
  for (const start of candidates) {
    let dir = start;
    for (let i = 0; i < 8; i++) {
      if (existsSync(join(dir, "specs", "tools", "common.schema.json"))) return dir;
      const parent = join(dir, "..");
      if (parent === dir) break;
      dir = parent;
    }
  }
  throw new Error(
    "无法定位仓库根目录：未找到 specs/tools/common.schema.json；可设置 WHAT2EAT_ROOT 指定",
  );
}

export function specsDir(): string {
  return join(findRepoRoot(), "specs");
}

export function defaultKnowledgeDir(): string {
  return process.env.WHAT2EAT_KNOWLEDGE_DIR ?? join(findRepoRoot(), "knowledge", "menu");
}
