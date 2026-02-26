import { describe, it, expect } from "vitest";
import {
  blocksToMarkdown,
  markdownToBlocks,
  richTextToMarkdown,
} from "../markdown.js";

// --- Helper to build Notion block objects ---
function block(type: string, props: Record<string, unknown> = {}) {
  return { type, [type]: props } as any;
}

function rt(text: string, annotations: Record<string, boolean> = {}, href?: string) {
  return {
    type: "text" as const,
    plain_text: text,
    annotations: { bold: false, italic: false, strikethrough: false, code: false, ...annotations },
    href: href ?? null,
    text: { content: text },
  };
}

// =============================================
// blocksToMarkdown
// =============================================
describe("blocksToMarkdown", () => {
  it("heading_1 → # Title", () => {
    const md = blocksToMarkdown([block("heading_1", { rich_text: [rt("Title")] })]);
    expect(md).toBe("# Title");
  });

  it("heading_2 → ## Title", () => {
    const md = blocksToMarkdown([block("heading_2", { rich_text: [rt("Title")] })]);
    expect(md).toBe("## Title");
  });

  it("heading_3 → ### Title", () => {
    const md = blocksToMarkdown([block("heading_3", { rich_text: [rt("Title")] })]);
    expect(md).toBe("### Title");
  });

  it("paragraph → plain text", () => {
    const md = blocksToMarkdown([block("paragraph", { rich_text: [rt("Hello world")] })]);
    expect(md).toBe("Hello world");
  });

  it("bulleted_list_item → - Item", () => {
    const md = blocksToMarkdown([block("bulleted_list_item", { rich_text: [rt("Item")] })]);
    expect(md).toBe("- Item");
  });

  it("numbered_list_item → 1. Item", () => {
    const md = blocksToMarkdown([block("numbered_list_item", { rich_text: [rt("Item")] })]);
    expect(md).toBe("1. Item");
  });

  it("to_do checked → - [x] Item", () => {
    const md = blocksToMarkdown([block("to_do", { rich_text: [rt("Item")], checked: true })]);
    expect(md).toBe("- [x] Item");
  });

  it("to_do unchecked → - [ ] Item", () => {
    const md = blocksToMarkdown([block("to_do", { rich_text: [rt("Item")], checked: false })]);
    expect(md).toBe("- [ ] Item");
  });

  it("code block → fenced code", () => {
    const md = blocksToMarkdown([
      block("code", { rich_text: [rt("const x = 1;")], language: "typescript" }),
    ]);
    expect(md).toBe("```typescript\nconst x = 1;\n```");
  });

  it("quote → > text", () => {
    const md = blocksToMarkdown([block("quote", { rich_text: [rt("wise words")] })]);
    expect(md).toBe("> wise words");
  });

  it("callout → > emoji text", () => {
    const md = blocksToMarkdown([
      block("callout", { rich_text: [rt("important")], icon: { type: "emoji", emoji: "💡" } }),
    ]);
    expect(md).toBe("> 💡 important");
  });

  it("divider → ---", () => {
    const md = blocksToMarkdown([block("divider")]);
    expect(md).toBe("---");
  });

  it("image → ![caption](url)", () => {
    const md = blocksToMarkdown([
      block("image", {
        type: "external",
        external: { url: "https://example.com/img.png" },
        caption: [rt("photo")],
      }),
    ]);
    expect(md).toBe("![photo](https://example.com/img.png)");
  });

  it("image with file type", () => {
    const md = blocksToMarkdown([
      block("image", {
        type: "file",
        file: { url: "https://s3.aws/img.png" },
        caption: [],
      }),
    ]);
    expect(md).toBe("![](https://s3.aws/img.png)");
  });

  it("toggle → <details> block", () => {
    const md = blocksToMarkdown([
      block("toggle", { rich_text: [rt("Click me")] }),
    ]);
    expect(md).toBe("<details><summary>Click me</summary>\n\n</details>");
  });

  it("table → markdown table", () => {
    const tableBlock = {
      type: "table",
      table: { has_column_header: true },
      children: [
        { type: "table_row", table_row: { cells: [[rt("Name")], [rt("Age")]] } },
        { type: "table_row", table_row: { cells: [[rt("Alice")], [rt("30")]] } },
      ],
    } as any;
    const md = blocksToMarkdown([tableBlock]);
    expect(md).toBe("| Name | Age |\n| --- | --- |\n| Alice | 30 |");
  });

  it("unsupported type → placeholder", () => {
    const md = blocksToMarkdown([block("synced_block", {})]);
    expect(md).toBe("[unsupported: synced_block]");
  });

  it("wrapUntrusted wraps output", () => {
    const md = blocksToMarkdown([block("paragraph", { rich_text: [rt("data")] })], {
      wrapUntrusted: true,
    });
    expect(md).toBe("<untrusted_content>\ndata\n</untrusted_content>");
  });

  it("rich text with bold/italic/code/links", () => {
    const richText = [
      rt("bold", { bold: true }),
      rt(" and "),
      rt("italic", { italic: true }),
      rt(" and "),
      rt("code", { code: true }),
      rt(" and "),
      rt("link", {}, "https://example.com"),
    ];
    const md = blocksToMarkdown([block("paragraph", { rich_text: richText })]);
    expect(md).toBe("**bold** and *italic* and `code` and [link](https://example.com)");
  });

  it("rich text with strikethrough", () => {
    const md = blocksToMarkdown([
      block("paragraph", { rich_text: [rt("removed", { strikethrough: true })] }),
    ]);
    expect(md).toBe("~~removed~~");
  });
});

// =============================================
// markdownToBlocks
// =============================================
describe("markdownToBlocks", () => {
  it("# Title → heading_1", () => {
    const blocks = markdownToBlocks("# Title");
    expect(blocks[0].type).toBe("heading_1");
    expect(blocks[0].heading_1.rich_text[0].text.content).toBe("Title");
  });

  it("## Title → heading_2", () => {
    const blocks = markdownToBlocks("## Subtitle");
    expect(blocks[0].type).toBe("heading_2");
  });

  it("### Title → heading_3", () => {
    const blocks = markdownToBlocks("### Sub");
    expect(blocks[0].type).toBe("heading_3");
  });

  it("plain text → paragraph", () => {
    const blocks = markdownToBlocks("Hello world");
    expect(blocks[0].type).toBe("paragraph");
    expect(blocks[0].paragraph.rich_text[0].text.content).toBe("Hello world");
  });

  it("- Item → bulleted_list_item", () => {
    const blocks = markdownToBlocks("- Item");
    expect(blocks[0].type).toBe("bulleted_list_item");
    expect(blocks[0].bulleted_list_item.rich_text[0].text.content).toBe("Item");
  });

  it("1. Item → numbered_list_item", () => {
    const blocks = markdownToBlocks("1. Item");
    expect(blocks[0].type).toBe("numbered_list_item");
    expect(blocks[0].numbered_list_item.rich_text[0].text.content).toBe("Item");
  });

  it("- [x] Item → to_do checked", () => {
    const blocks = markdownToBlocks("- [x] Done");
    expect(blocks[0].type).toBe("to_do");
    expect(blocks[0].to_do.checked).toBe(true);
    expect(blocks[0].to_do.rich_text[0].text.content).toBe("Done");
  });

  it("- [ ] Item → to_do unchecked", () => {
    const blocks = markdownToBlocks("- [ ] Pending");
    expect(blocks[0].type).toBe("to_do");
    expect(blocks[0].to_do.checked).toBe(false);
  });

  it("fenced code → code block", () => {
    const blocks = markdownToBlocks("```js\nconst x = 1;\n```");
    expect(blocks[0].type).toBe("code");
    expect(blocks[0].code.language).toBe("js");
    expect(blocks[0].code.rich_text[0].text.content).toBe("const x = 1;");
  });

  it("> quote → quote block", () => {
    const blocks = markdownToBlocks("> wise words");
    expect(blocks[0].type).toBe("quote");
    expect(blocks[0].quote.rich_text[0].text.content).toBe("wise words");
  });

  it("--- → divider", () => {
    const blocks = markdownToBlocks("---");
    expect(blocks[0].type).toBe("divider");
  });

  it("![alt](url) → image", () => {
    const blocks = markdownToBlocks("![photo](https://example.com/img.png)");
    expect(blocks[0].type).toBe("image");
    expect(blocks[0].image.external.url).toBe("https://example.com/img.png");
    expect(blocks[0].image.caption[0].text.content).toBe("photo");
  });

  it("empty lines are skipped", () => {
    const blocks = markdownToBlocks("Hello\n\n\nWorld");
    expect(blocks).toHaveLength(2);
    expect(blocks[0].paragraph.rich_text[0].text.content).toBe("Hello");
    expect(blocks[1].paragraph.rich_text[0].text.content).toBe("World");
  });
});

// =============================================
// richTextToMarkdown (unit)
// =============================================
describe("richTextToMarkdown", () => {
  it("plain text passes through", () => {
    expect(richTextToMarkdown([rt("hello")])).toBe("hello");
  });

  it("applies all annotations", () => {
    const result = richTextToMarkdown([
      rt("bold", { bold: true }),
      rt("italic", { italic: true }),
      rt("strike", { strikethrough: true }),
      rt("code", { code: true }),
    ]);
    expect(result).toBe("**bold***italic*~~strike~~`code`");
  });

  it("handles links", () => {
    expect(richTextToMarkdown([rt("click", {}, "https://x.com")])).toBe("[click](https://x.com)");
  });
});
