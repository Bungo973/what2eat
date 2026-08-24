import { existsSync, readFileSync } from "node:fs";
import { dirname, resolve, sep } from "node:path";
import { describe, expect, it } from "vitest";
import { parse as parseYaml } from "yaml";

const skillPath = resolve("skills", "meal-planning", "SKILL.md");
const skillDir = dirname(skillPath);
const skillText = readFileSync(skillPath, "utf-8");
const frontmatterMatch = /^---\r?\n([\s\S]+?)\r?\n---\r?\n/.exec(skillText);

describe("meal-planning Skill", () => {
  it("frontmatter 可发现且描述能区分适用范围", () => {
    expect(frontmatterMatch).not.toBeNull();
    const frontmatter = parseYaml(frontmatterMatch![1]!) as Record<string, unknown>;
    expect(frontmatter.name).toBe("meal-planning");
    expect(String(frontmatter.description)).toContain("what2eat");
    expect(String(frontmatter.description)).toContain("不用于医疗营养诊断");
  });

  it("所有引用都自包含在 Skill 目录，生成规范与事实源保持同步", () => {
    const links = [...skillText.matchAll(/\[[^\]]+\]\(([^)]+\.md)\)/g)].map((match) => match[1]!);
    expect(links.length).toBeGreaterThanOrEqual(3);
    for (const link of links) {
      const target = resolve(skillDir, link);
      expect(target.startsWith(`${skillDir}${sep}`), `Skill 引用逃出包目录: ${link}`).toBe(true);
      expect(existsSync(target), `缺少 Skill 引用: ${link}`).toBe(true);
    }

    expect(readFileSync(resolve(skillDir, "references", "meal-planning.md"), "utf-8")).toBe(
      readFileSync(resolve("specs", "behavior", "meal-planning.md"), "utf-8"),
    );
    expect(readFileSync(resolve(skillDir, "references", "user-output.md"), "utf-8")).toBe(
      readFileSync(resolve("specs", "behavior", "user-output.md"), "utf-8"),
    );
  });

  it("首次接触给出两个克制示例，不暴露工具连接信息", () => {
    const outputContract = readFileSync(resolve(skillDir, "references", "user-output.md"), "utf-8");
    expect(outputContract).toContain("后面两天晚餐，2 人份，无忌口，预算 100 元，上海");
    expect(outputContract).toContain("冰箱里有土豆和鸡蛋，今晚能做什么？");
    expect(outputContract).toContain("示例最多两个");
    expect(outputContract).toContain("不报告 MCP 已连接、工具数量或内部能力名称");
  });

  it("价格与预算要求摘要和逐项表格，并保留缺价项", () => {
    const outputContract = readFileSync(resolve(skillDir, "references", "user-output.md"), "utf-8");
    expect(outputContract).toContain("先输出预算摘要表，再输出逐项估价表");
    expect(outputContract).toContain("| 项目 | 结果 |");
    expect(outputContract).toContain(
      "| 食材 | 采购量 | 参考单价 | 预计小计 | 报价地区/层级 | 口径与来源 | 数据时间 | 可信度 |",
    );
    expect(outputContract).toContain("逐项表应覆盖所有待采购食材");
    expect(outputContract).toContain("参考单价和预计小计写“—”");
  });

  it("声明且仅声明八个公共 MCP 工具", () => {
    const expected = [
      "aggregate_shopping_list",
      "find_replacements",
      "grep_recipe_docs",
      "quote_ingredient_prices",
      "read_recipe",
      "render_meal_plan_html",
      "search_recipes",
      "validate_meal_plan",
    ];
    const declared = [...skillText.matchAll(/`([a-z_]+)`/g)]
      .map((match) => match[1]!)
      .filter((name) => expected.includes(name));
    expect([...new Set(declared)].sort()).toEqual(expected);
  });

  it("Pi 适配为八个规范工具提供唯一的命名空间映射", () => {
    const adapter = readFileSync(resolve(skillDir, "references", "pi-mcp.md"), "utf-8");
    const expected = [
      "aggregate_shopping_list",
      "find_replacements",
      "grep_recipe_docs",
      "quote_ingredient_prices",
      "read_recipe",
      "render_meal_plan_html",
      "search_recipes",
      "validate_meal_plan",
    ];
    for (const canonical of expected) {
      expect(adapter).toContain(`\`what2eat_${canonical}\``);
    }
  });

  it("完整结果默认全国参考报价和 HTML，用户仍可明确拒绝", () => {
    expect(skillText).toContain("完整菜谱或正式餐单默认汇总采购并给出参考报价");
    expect(skillText).toContain("用户明确说“不需要价格/不要报价”时跳过");
    expect(skillText).toContain("地区缺失时不传 `region`");
    expect(skillText).toContain("`render_meal_plan_html`");
  });
});
