import { copyFileSync, mkdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const referencesDir = join(root, "skills", "meal-planning", "references");
const mappings = [
  [join(root, "specs", "behavior", "meal-planning.md"), join(referencesDir, "meal-planning.md")],
  [join(root, "specs", "behavior", "user-output.md"), join(referencesDir, "user-output.md")],
];
const checkOnly = process.argv.includes("--check");

mkdirSync(referencesDir, { recursive: true });

const stale = [];
for (const [source, target] of mappings) {
  const sourceContent = readFileSync(source, "utf-8");
  if (checkOnly) {
    let targetContent = null;
    try {
      targetContent = readFileSync(target, "utf-8");
    } catch {
      // Missing generated reference is reported as stale below.
    }
    if (targetContent !== sourceContent) stale.push(target);
  } else {
    copyFileSync(source, target);
  }
}

if (stale.length > 0) {
  process.stderr.write(
    `Skill 引用未同步，请运行 npm run skill:build：\n${stale.map((path) => `- ${path}`).join("\n")}\n`,
  );
  process.exitCode = 1;
} else {
  process.stdout.write(checkOnly ? "Skill 引用已同步\n" : "Skill 引用构建完成\n");
}
