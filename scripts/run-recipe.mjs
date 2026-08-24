import { spawnSync } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const entry = join(root, "packages", "recipe-domain", "src", "cli", "index.ts");
const [major = 0, minor = 0] = process.versions.node.split(".").map(Number);
const supportsTypeStripping = major > 22 || (major === 22 && minor >= 6);
const forwardedArgs = process.argv.slice(2);
const args = supportsTypeStripping
  ? ["--experimental-strip-types", entry, ...forwardedArgs]
  : [join(root, "node_modules", "tsx", "dist", "cli.mjs"), entry, ...forwardedArgs];

const result = spawnSync(process.execPath, args, { stdio: "inherit" });
if (result.error) {
  process.stderr.write(`无法启动菜谱 CLI: ${result.error.message}\n`);
  process.exitCode = 1;
} else {
  process.exitCode = result.status ?? 1;
}
