import { createHash } from "node:crypto";
import { mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { renderMealPlanHtml, type MealPlanHtmlInput } from "@what2eat/recipe-domain";

export function renderHtmlArtifact(input: MealPlanHtmlInput) {
  const html = renderMealPlanHtml(input);
  const digest = createHash("sha256").update(html).digest("hex").slice(0, 12);
  const filename = `meal-plan-${digest}.html`;
  const root = resolve(process.env.WHAT2EAT_ARTIFACT_DIR ?? join(tmpdir(), "what2eat-artifacts"));
  mkdirSync(root, { recursive: true });
  const artifactPath = join(root, filename);
  writeFileSync(artifactPath, html, "utf-8");
  return {
    filename,
    mime_type: "text/html; charset=utf-8" as const,
    html,
    artifact_path: artifactPath,
    warnings: [],
  };
}
