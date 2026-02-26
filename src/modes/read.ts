import type { ToolContext, ToolParams } from "../tool.js";
import { extractProperty } from "../properties.js";
import { blocksToMarkdown } from "../markdown.js";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function handleRead(ctx: ToolContext, params: ToolParams): Promise<string> {
  if (!params.page_id) {
    return JSON.stringify({ error: "page_id required", suggestion: "Provide a Notion page UUID" });
  }
  if (!UUID_RE.test(params.page_id)) {
    return JSON.stringify({ error: "Invalid page_id: must be a UUID", suggestion: "Format: 12345678-1234-1234-1234-123456789abc" });
  }

  const [page, blockList] = await Promise.all([
    ctx.api.retryWithBackoff(() => ctx.api.client.pages.retrieve({ page_id: params.page_id! })),
    ctx.api.retryWithBackoff(() => ctx.api.client.blocks.children.list({ block_id: params.page_id! })),
  ]);

  // Extract properties, omit empty
  const properties: Record<string, string> = {};
  if ("properties" in page) {
    for (const [name, prop] of Object.entries(page.properties as Record<string, any>)) {
      const val = extractProperty(prop);
      if (val) properties[name] = val;
    }
  }

  // Convert blocks to markdown with XPIA defense
  const content = blocksToMarkdown(blockList.results as any[], { wrapUntrusted: true });

  return JSON.stringify({ properties, content });
}
