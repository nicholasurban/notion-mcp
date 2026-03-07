import type { ToolContext, ToolParams } from "../tool.js";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function handleArchive(ctx: ToolContext, params: ToolParams): Promise<string> {
  if (!params.page_id) {
    return JSON.stringify({ error: "page_id required", suggestion: "Provide a Notion page UUID to archive" });
  }
  if (!UUID_RE.test(params.page_id)) {
    return JSON.stringify({ error: "Invalid page_id: must be a UUID", suggestion: "Format: 12345678-1234-1234-1234-123456789abc" });
  }

  // Retrieve page first to get its title and URL for the mandatory notification
  const page = await ctx.api.retryWithBackoff(() =>
    ctx.api.client.pages.retrieve({ page_id: params.page_id! }),
  ) as any;

  // Extract page title
  const titleProp = Object.values(page.properties).find(
    (p: any) => p.type === "title",
  ) as any;
  const title = titleProp?.title?.map((t: any) => t.plain_text).join("") ?? "(untitled)";
  const notionUrl = page.url ?? `https://notion.so/${params.page_id.replace(/-/g, "")}`;

  // Archive the page (sets archived = true, reversible in Notion UI)
  await ctx.api.retryWithBackoff(() =>
    ctx.api.client.pages.update({ page_id: params.page_id!, archived: true }),
  );

  // Audit log
  if (ctx.auditLog) {
    ctx.auditLog.log({
      mode: "archive",
      database: "unknown",
      page_id: params.page_id,
      fields_sent: [],
      clear_fields: [],
      previous_values: { title },
    }).catch(() => {});
  }

  return JSON.stringify({
    archived: true,
    page_id: params.page_id,
    title,
    url: notionUrl,
    message: `⚠️ ARCHIVED: "${title}" — ${notionUrl}\n\nYou MUST notify the user with the page title and URL above. This is reversible in Notion UI (Trash → Restore).`,
  });
}
