import type { ToolContext, ToolParams } from "../tool.js";
import { markdownToBlocks } from "../markdown.js";
import { buildProperties } from "../build-properties.js";
import { validateWriteAllowlist, stripEmptyValues } from "../safety.js";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const MAX_CONTENT_SIZE = 100_000;

export async function handleUpdate(ctx: ToolContext, params: ToolParams): Promise<string> {
  if (!params.page_id) {
    return JSON.stringify({ error: "page_id required", suggestion: "Provide a Notion page UUID" });
  }
  if (!UUID_RE.test(params.page_id)) {
    return JSON.stringify({ error: "Invalid page_id: must be a UUID", suggestion: "Format: 12345678-1234-1234-1234-123456789abc" });
  }
  if (!params.properties && !params.content) {
    return JSON.stringify({ error: "Must provide properties or content to update" });
  }
  if (params.content && params.content.length > MAX_CONTENT_SIZE) {
    return JSON.stringify({ error: "Content exceeds 100KB limit", suggestion: "Split into smaller updates" });
  }

  // Check for batch mode: page_ids array inside properties
  const pageIds = params.properties?.page_ids;
  if (Array.isArray(pageIds)) {
    return await batchUpdate(ctx, params, pageIds as string[]);
  }

  return await singleUpdate(ctx, params, params.page_id);
}

async function resolvePageDatabase(
  ctx: ToolContext,
  pageId: string,
): Promise<{ databaseId: string; dbName: string | null }> {
  const page = await ctx.api.retryWithBackoff(() =>
    ctx.api.client.pages.retrieve({ page_id: pageId }),
  );
  const parent = (page as any).parent;
  // SDK v5 uses "data_source_id" parent type instead of "database_id"
  const databaseId = parent?.type === "database_id"
    ? parent.database_id
    : parent?.type === "data_source_id"
      ? (parent.database_id ?? parent.data_source_id)
      : null;

  let dbName: string | null = null;
  if (databaseId) {
    for (const [name, db] of Object.entries(ctx.config.databases)) {
      if (db.id.replace(/-/g, "") === databaseId.replace(/-/g, "")) {
        dbName = name;
        break;
      }
    }
  }

  return { databaseId, dbName };
}

function checkAllowed(ctx: ToolContext, dbName: string | null): string | null {
  if (!dbName) return null; // page not in a configured database — allow update
  const db = ctx.config.databases[dbName];
  if (db && !db.allowedActions.includes("update")) {
    return `Update not allowed on database '${dbName}'`;
  }
  return null;
}

async function singleUpdate(
  ctx: ToolContext,
  params: ToolParams,
  pageId: string,
): Promise<string> {
  const { databaseId, dbName } = await resolvePageDatabase(ctx, pageId);
  const err = checkAllowed(ctx, dbName);
  if (err) return JSON.stringify({ error: err });

  // Safety: validate writeAllowlist
  if (params.properties && dbName) {
    const db = ctx.config.databases[dbName];
    if (db?.writeAllowlist && db.writeAllowlist.length > 0) {
      const err2 = validateWriteAllowlist(params.properties, db.writeAllowlist, params.clear_fields);
      if (err2) return JSON.stringify({ error: err2 });
    }
  }

  // Safety: strip empty values
  if (params.properties) {
    params.properties = stripEmptyValues(params.properties) as Record<string, unknown>;
  }

  // Update properties
  if (params.properties && Object.keys(params.properties).length > 0 || params.clear_fields?.length) {
    const schema = databaseId
      ? await ctx.api.getSchema(databaseId)
      : {};
    const notionProps = buildProperties(params.properties ?? {}, schema);

    // Handle clear_fields: build explicit empty values
    if (params.clear_fields?.length) {
      for (const field of params.clear_fields) {
        const type = schema[field];
        if (!type) continue;
        switch (type) {
          case "rich_text": notionProps[field] = { rich_text: [] }; break;
          case "multi_select": notionProps[field] = { multi_select: [] }; break;
          case "relation": notionProps[field] = { relation: [] }; break;
          case "url": notionProps[field] = { url: null }; break;
          case "email": notionProps[field] = { email: null }; break;
          case "number": notionProps[field] = { number: null }; break;
          case "date": notionProps[field] = { date: null }; break;
          case "select": notionProps[field] = { select: null }; break;
          case "status": notionProps[field] = { status: null }; break;
          case "checkbox": notionProps[field] = { checkbox: false }; break;
          default: break;
        }
      }
    }

    await ctx.api.retryWithBackoff(() =>
      ctx.api.client.pages.update({ page_id: pageId, properties: notionProps as any }),
    );
  }

  // Replace content
  if (params.content) {
    await replaceContent(ctx, pageId, params.content);
  }

  return JSON.stringify({ updated: true, page_id: pageId });
}

async function batchUpdate(
  ctx: ToolContext,
  params: ToolParams,
  pageIds: string[],
): Promise<string> {
  // Build properties without page_ids key
  const { page_ids: _, ...restProps } = params.properties!;

  // Safety: strip empty values from shared properties
  const cleanedProps = stripEmptyValues(restProps as Record<string, unknown>) as Record<string, unknown>;

  const results: Array<{ page_id: string; ok: boolean; error?: string }> = [];

  for (const pageId of pageIds) {
    try {
      if (!UUID_RE.test(pageId)) {
        results.push({ page_id: pageId, ok: false, error: "Invalid UUID" });
        continue;
      }

      const { databaseId, dbName } = await resolvePageDatabase(ctx, pageId);
      const err = checkAllowed(ctx, dbName);
      if (err) {
        results.push({ page_id: pageId, ok: false, error: err });
        continue;
      }

      // Safety: validate writeAllowlist
      if (dbName) {
        const db = ctx.config.databases[dbName];
        if (db?.writeAllowlist && db.writeAllowlist.length > 0) {
          const err2 = validateWriteAllowlist(cleanedProps, db.writeAllowlist, params.clear_fields);
          if (err2) {
            results.push({ page_id: pageId, ok: false, error: err2 });
            continue;
          }
        }
      }

      const schema = databaseId
        ? await ctx.api.getSchema(databaseId)
        : {};
      const notionProps = buildProperties(cleanedProps, schema);
      await ctx.api.retryWithBackoff(() =>
        ctx.api.client.pages.update({ page_id: pageId, properties: notionProps as any }),
      );
      results.push({ page_id: pageId, ok: true });
    } catch (e: any) {
      results.push({ page_id: pageId, ok: false, error: e.message });
    }
  }

  return JSON.stringify({ updated: results.filter((r) => r.ok).length, results });
}

async function replaceContent(ctx: ToolContext, pageId: string, content: string): Promise<void> {
  // List existing blocks
  const existing = await ctx.api.retryWithBackoff(() =>
    ctx.api.client.blocks.children.list({ block_id: pageId }),
  );

  // Delete all existing blocks
  for (const block of existing.results as any[]) {
    await ctx.api.retryWithBackoff(() =>
      ctx.api.client.blocks.delete({ block_id: block.id }),
    );
  }

  // Append new blocks from markdown
  const blocks = markdownToBlocks(content);
  if (blocks.length > 0) {
    await ctx.api.retryWithBackoff(() =>
      ctx.api.client.blocks.children.append({
        block_id: pageId,
        children: blocks as any,
      }),
    );
  }
}
