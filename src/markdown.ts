/**
 * Bidirectional Notion blocks <-> Markdown converter.
 * Used by read mode (blocks→md) and create/update (md→blocks).
 */

// --- Types ---
interface RichTextItem {
  type: string;
  plain_text: string;
  annotations: {
    bold: boolean;
    italic: boolean;
    strikethrough: boolean;
    code: boolean;
  };
  href: string | null;
  text: { content: string };
}

interface NotionBlock {
  type: string;
  [key: string]: any;
}

interface ConvertOptions {
  wrapUntrusted?: boolean;
}

// --- Rich text helpers ---

export function richTextToMarkdown(items: RichTextItem[]): string {
  return items
    .map((item) => {
      let text = item.plain_text;
      const a = item.annotations;
      if (a?.code) text = `\`${text}\``;
      if (a?.bold) text = `**${text}**`;
      if (a?.italic) text = `*${text}*`;
      if (a?.strikethrough) text = `~~${text}~~`;
      if (item.href) text = `[${text}](${item.href})`;
      return text;
    })
    .join("");
}

function textToRichText(content: string): RichTextItem[] {
  return [{ type: "text", plain_text: content, annotations: { bold: false, italic: false, strikethrough: false, code: false }, href: null, text: { content } }];
}

// --- Blocks → Markdown ---

function blockToMarkdown(block: NotionBlock): string {
  const data = block[block.type] ?? {};
  const text = () => richTextToMarkdown(data.rich_text ?? []);

  switch (block.type) {
    case "heading_1": return `# ${text()}`;
    case "heading_2": return `## ${text()}`;
    case "heading_3": return `### ${text()}`;
    case "paragraph": return text();
    case "bulleted_list_item": return `- ${text()}`;
    case "numbered_list_item": return `1. ${text()}`;
    case "to_do": return `- [${data.checked ? "x" : " "}] ${text()}`;
    case "code": return `\`\`\`${data.language ?? ""}\n${text()}\n\`\`\``;
    case "quote": return `> ${text()}`;
    case "callout": {
      const emoji = data.icon?.type === "emoji" ? `${data.icon.emoji} ` : "";
      return `> ${emoji}${text()}`;
    }
    case "divider": return "---";
    case "image": {
      const url = data.type === "external" ? data.external?.url : data.file?.url;
      const caption = richTextToMarkdown(data.caption ?? []);
      return `![${caption}](${url})`;
    }
    case "toggle": return `<details><summary>${text()}</summary>\n\n</details>`;
    case "table": {
      const rows: any[] = block.children ?? [];
      const lines: string[] = [];
      rows.forEach((row: any, i: number) => {
        const cells = row.table_row.cells.map((cell: RichTextItem[]) => richTextToMarkdown(cell));
        lines.push(`| ${cells.join(" | ")} |`);
        if (i === 0 && data.has_column_header) {
          lines.push(`| ${cells.map(() => "---").join(" | ")} |`);
        }
      });
      return lines.join("\n");
    }
    default: return `[unsupported: ${block.type}]`;
  }
}

export function blocksToMarkdown(blocks: NotionBlock[], options?: ConvertOptions): string {
  const md = blocks.map(blockToMarkdown).join("\n");
  if (options?.wrapUntrusted) return `<untrusted_content>\n${md}\n</untrusted_content>`;
  return md;
}

// --- Markdown → Blocks ---

export function markdownToBlocks(markdown: string): NotionBlock[] {
  const lines = markdown.split("\n");
  const blocks: NotionBlock[] = [];
  let i = 0;

  while (i < lines.length) {
    const line = lines[i];

    // Empty line → skip
    if (line.trim() === "") { i++; continue; }

    // Code fence
    const fenceMatch = line.match(/^```(\w*)$/);
    if (fenceMatch) {
      const lang = fenceMatch[1] || "plain text";
      const codeLines: string[] = [];
      i++;
      while (i < lines.length && !lines[i].match(/^```$/)) {
        codeLines.push(lines[i]);
        i++;
      }
      i++; // skip closing ```
      blocks.push({ type: "code", code: { rich_text: textToRichText(codeLines.join("\n")), language: lang } });
      continue;
    }

    // Headings
    const h3 = line.match(/^### (.+)$/);
    if (h3) { blocks.push({ type: "heading_3", heading_3: { rich_text: textToRichText(h3[1]) } }); i++; continue; }

    const h2 = line.match(/^## (.+)$/);
    if (h2) { blocks.push({ type: "heading_2", heading_2: { rich_text: textToRichText(h2[1]) } }); i++; continue; }

    const h1 = line.match(/^# (.+)$/);
    if (h1) { blocks.push({ type: "heading_1", heading_1: { rich_text: textToRichText(h1[1]) } }); i++; continue; }

    // Divider
    if (line.match(/^---+$/)) { blocks.push({ type: "divider", divider: {} }); i++; continue; }

    // To-do
    const todo = line.match(/^- \[(x| )\] (.+)$/);
    if (todo) { blocks.push({ type: "to_do", to_do: { rich_text: textToRichText(todo[2]), checked: todo[1] === "x" } }); i++; continue; }

    // Bulleted list
    const bullet = line.match(/^- (.+)$/);
    if (bullet) { blocks.push({ type: "bulleted_list_item", bulleted_list_item: { rich_text: textToRichText(bullet[1]) } }); i++; continue; }

    // Numbered list
    const numbered = line.match(/^\d+\. (.+)$/);
    if (numbered) { blocks.push({ type: "numbered_list_item", numbered_list_item: { rich_text: textToRichText(numbered[1]) } }); i++; continue; }

    // Quote
    const quote = line.match(/^> (.+)$/);
    if (quote) { blocks.push({ type: "quote", quote: { rich_text: textToRichText(quote[1]) } }); i++; continue; }

    // Image
    const img = line.match(/^!\[([^\]]*)\]\(([^)]+)\)$/);
    if (img) {
      blocks.push({
        type: "image",
        image: {
          type: "external",
          external: { url: img[2] },
          caption: textToRichText(img[1]),
        },
      });
      i++; continue;
    }

    // Default: paragraph
    blocks.push({ type: "paragraph", paragraph: { rich_text: textToRichText(line) } });
    i++;
  }

  return blocks;
}
