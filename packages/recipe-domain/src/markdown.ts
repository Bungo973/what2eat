import { parse, stringify } from "yaml";

export interface ParsedDocument {
  meta: unknown;
  body: string;
}

const FM_OPEN = /^---\r?\n/;
const FM_CLOSE = /\r?\n---\s*(\r?\n|$)/;

/** 解析 `---\n<yaml>\n---\n<body>` 结构的 Markdown 文档。 */
export function parseMarkdown(raw: string): ParsedDocument {
  if (!FM_OPEN.test(raw)) {
    throw new Error("frontmatter 起始分隔符缺失");
  }
  const closeMatch = FM_CLOSE.exec(raw.slice(4));
  if (!closeMatch) {
    throw new Error("frontmatter 结束分隔符缺失");
  }
  const yamlText = raw.slice(4, 4 + closeMatch.index);
  const body = raw.slice(4 + closeMatch.index + closeMatch[0].length);
  let meta: unknown;
  try {
    meta = parse(yamlText);
  } catch (e) {
    throw new Error(`frontmatter YAML 解析失败: ${(e as Error).message}`);
  }
  if (meta === null || typeof meta !== "object" || Array.isArray(meta)) {
    throw new Error("frontmatter 必须是对象");
  }
  return { meta, body };
}

/** 将 meta 与正文重新序列化为完整 Markdown 文档。 */
export function serializeMarkdown(meta: Record<string, unknown>, body: string): string {
  const yamlText = stringify(meta, { lineWidth: 100 });
  const normalizedBody = body.startsWith("\n") || body === "" ? body : `\n${body}`;
  return `---\n${yamlText.trimEnd()}\n---${normalizedBody.endsWith("\n") ? normalizedBody : `${normalizedBody}\n`}`;
}
