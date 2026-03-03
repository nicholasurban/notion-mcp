import type { ToolContext, ToolParams } from "../tool.js";
import { AIError } from "../api.js";
import { markdownToBlocks } from "../markdown.js";
import { validateWriteAllowlist, stripEmptyValues } from "../safety.js";

const MAX_CONTENT_BYTES = 100_000;

function buildProperties(
  props: Record<string, unknown>,
  schema: Record<string, string>,
): { properties: Record<string, unknown>; warnings: string[] } {
  const properties: Record<string, unknown> = {};
  const warnings: string[] = [];

  for (const [key, value] of Object.entries(props)) {
    const type = schema[key];
    if (!type) {
      warnings.push(`Unknown property '${key}', skipped`);
      continue;
    }
    switch (type) {
      case "title":
        properties[key] = { title: [{ text: { content: String(value) } }] };
        break;
      case "rich_text":
        properties[key] = { rich_text: [{ text: { content: String(value) } }] };
        break;
      case "select":
        properties[key] = { select: { name: String(value) } };
        break;
      case "multi_select": {
        const items = Array.isArray(value)
          ? value
          : String(value).split(",").map((s) => s.trim());
        properties[key] = { multi_select: items.map((v: string) => ({ name: v })) };
        break;
      }
      case "number":
        properties[key] = { number: Number(value) };
        break;
      case "checkbox":
        properties[key] = { checkbox: Boolean(value) };
        break;
      case "url":
        properties[key] = { url: String(value) };
        break;
      case "email":
        properties[key] = { email: String(value) };
        break;
      case "date":
        properties[key] = { date: { start: String(value) } };
        break;
      case "status":
        properties[key] = { status: { name: String(value) } };
        break;
      default:
        warnings.push(`Unsupported property type '${type}' for '${key}', skipped`);
    }
  }

  return { properties, warnings };
}

export async function handleCreate(ctx: ToolContext, params: ToolParams): Promise<string> {
  if (!params.database) {
    return JSON.stringify({ error: "database is required", suggestion: "Provide a database name" });
  }

  const dbConfig = ctx.config.databases[params.database];
  if (!dbConfig) {
    const available = ctx.config.databaseNames.join(", ");
    return JSON.stringify({ error: `Database '${params.database}' not found`, suggestion: `Available: ${available}` });
  }

  if (!dbConfig.allowedActions.includes("create")) {
    return JSON.stringify({ error: `Action 'create' is not allowed on '${params.database}'` });
  }

  if (!params.properties || Object.keys(params.properties).length === 0) {
    return JSON.stringify({ error: "properties required — provide at least a title" });
  }

  if (params.content && params.content.length > MAX_CONTENT_BYTES) {
    return JSON.stringify({ error: `Content exceeds 100KB limit (${params.content.length} chars)` });
  }

  // Safety: validate writeAllowlist
  if (dbConfig.writeAllowlist && dbConfig.writeAllowlist.length > 0) {
    const allowlistErr = validateWriteAllowlist(params.properties, dbConfig.writeAllowlist, params.clear_fields);
    if (allowlistErr) return JSON.stringify({ error: allowlistErr });
  }

  // Safety: strip empty values
  params.properties = stripEmptyValues(params.properties) as Record<string, unknown>;

  if (Object.keys(params.properties).length === 0 && !params.content) {
    return JSON.stringify({ error: "All properties were empty after stripping — nothing to create" });
  }

  const dbId = dbConfig.id;
  const schema = await ctx.api.getSchema(dbId);
  const { properties, warnings } = buildProperties(params.properties, schema);

  const createPayload: any = {
    parent: { database_id: dbId },
    properties,
  };

  if (params.content) {
    createPayload.children = markdownToBlocks(params.content);
  }

  const page = await ctx.api.client.pages.create(createPayload) as any;

  const result: Record<string, unknown> = {
    created: true,
    page_id: page.id,
    url: page.url,
  };
  if (warnings.length > 0) result.warnings = warnings;

  return JSON.stringify(result);
}
