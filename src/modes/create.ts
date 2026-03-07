import type { ToolContext, ToolParams } from "../tool.js";
import { AIError } from "../api.js";
import { buildProperties as sharedBuildProperties } from "../build-properties.js";
import { markdownToBlocks } from "../markdown.js";
import { validateWriteAllowlist, stripEmptyValues } from "../safety.js";

const MAX_CONTENT_BYTES = 100_000;

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
  const built = sharedBuildProperties(params.properties, schema);

  // Extract skipped fields metadata
  const skipped = (built as any).__skipped as Array<{ field: string; type: string; reason: string }> | undefined;
  delete (built as any).__skipped;

  const warnings: string[] = [];
  if (skipped?.length) {
    for (const s of skipped) {
      warnings.push(`${s.reason}: '${s.field}' (${s.type})`);
    }
  }

  const createPayload: any = {
    parent: { database_id: dbId },
    properties: built,
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
