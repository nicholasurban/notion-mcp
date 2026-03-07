import type { ToolContext, ToolParams } from "../tool.js";
import { formatTable } from "../format.js";
import { extractProperty } from "../properties.js";

/** Notion property types that support `contains` text filter */
const TEXT_FILTER_TYPES = new Set(["title", "rich_text", "url", "email", "phone_number"]);

export async function handleSearch(ctx: ToolContext, params: ToolParams): Promise<string> {
  if (!params.query) {
    return JSON.stringify({ error: "query parameter is required for search mode" });
  }

  const limit = params.limit ?? 50;

  // Database-scoped search: query property values directly
  if (params.database) {
    return databaseSearch(ctx, params.database, params.query, limit);
  }

  // Global search: Notion search API (title-only)
  return globalSearch(ctx, params.query, limit);
}

async function databaseSearch(ctx: ToolContext, dbName: string, query: string, limit: number): Promise<string> {
  const dbConfig = ctx.config.databases[dbName];
  if (!dbConfig) {
    return JSON.stringify({
      error: `Database '${dbName}' not found`,
      suggestion: `Available: ${ctx.config.databaseNames.join(", ")}`,
    });
  }

  // Get schema to discover searchable text fields
  const schema = await ctx.api.getSchema(dbConfig.id);

  // Determine which fields to search: config searchFields, or auto-discover text fields
  let fieldNames: string[];
  if (dbConfig.searchFields?.length) {
    fieldNames = dbConfig.searchFields.filter((f) => f in schema && TEXT_FILTER_TYPES.has(schema[f]));
  } else {
    fieldNames = Object.entries(schema)
      .filter(([, type]) => TEXT_FILTER_TYPES.has(type))
      .map(([name]) => name);
  }

  if (fieldNames.length === 0) {
    return JSON.stringify({ error: "No searchable text fields in this database" });
  }

  // Build OR filter with `contains` for each searchable field
  const conditions = fieldNames.map((field) => {
    const type = schema[field];
    // Map property type to the correct Notion filter key
    const filterKey = type === "title" ? "title" : type === "url" ? "url" : type === "email" ? "email" : type === "phone_number" ? "phone_number" : "rich_text";
    return { property: field, [filterKey]: { contains: query } };
  });

  const filter = conditions.length === 1 ? conditions[0] : { or: conditions };

  const { results, has_more } = await ctx.api.paginateAll(
    (cursor) => ctx.api.queryDatabase(dbConfig.id, {
      filter,
      page_size: Math.min(limit, 100),
      start_cursor: cursor,
    }),
    limit
  );

  // Extract properties (same logic as query mode)
  const priorityFields = dbConfig.fields ?? [];
  const rows = results.map((page: any) => {
    const row: Record<string, string> = {};
    // Always include page_id so callers can use it for updates
    row["page_id"] = page.id;
    for (const field of priorityFields) {
      if (page.properties?.[field]) {
        row[field] = extractProperty(page.properties[field]);
      }
    }
    if (page.properties) {
      for (const [key, prop] of Object.entries(page.properties)) {
        if (key in row) continue;
        const val = extractProperty(prop);
        if (val && val !== "[unsupported]") {
          row[key] = val;
        }
      }
    }
    return row;
  });

  const allColumns = new Set<string>(priorityFields);
  for (const row of rows) {
    for (const key of Object.keys(row)) allColumns.add(key);
  }

  const estimatedTotal = has_more ? ctx.api.getEstimatedCount(dbConfig.id) : null;

  if (has_more && estimatedTotal === null) {
    ctx.api.refreshCount(dbConfig.id).catch(() => {});
  }

  const table = formatTable(rows, [...allColumns], {
    fetched: rows.length,
    estimatedTotal: has_more ? estimatedTotal : undefined,
  });

  let paginationLine: string;
  if (has_more) {
    const countInfo = estimatedTotal != null ? `of ~${estimatedTotal} items (cached count, may be stale)` : "items (estimated_total: unknown - will be cached after this request)";
    paginationLine = `⚠️ TRUNCATED - fetched ${rows.length} ${countInfo}. Increase limit (max 500) or add filters to narrow results.`;
  } else {
    paginationLine = `✅ COMPLETE - all ${rows.length} matching items returned.`;
  }

  if (rows.length === 0) return `${table}\n${paginationLine}`;
  return `<untrusted_content>\n${table}\n</untrusted_content>\n${paginationLine}`;
}

async function globalSearch(ctx: ToolContext, query: string, limit: number): Promise<string> {
  // Build reverse map: database_id → friendly name (normalize to no hyphens)
  const idToName = new Map<string, string>();
  for (const [name, db] of Object.entries(ctx.config.databases)) {
    idToName.set(db.id.replace(/-/g, ""), name);
  }

  const response = await ctx.api.client.search({
    query,
    filter: { property: "object", value: "page" },
  });

  // Filter to only pages from configured databases (normalize IDs; SDK v5 uses "data_source_id" parent type)
  const getParentDbId = (r: any): string | null => {
    if (r.parent?.type === "database_id") return r.parent.database_id;
    if (r.parent?.type === "data_source_id") return r.parent.database_id ?? r.parent.data_source_id;
    return null;
  };
  const filtered = response.results.filter((r: any) => {
    const dbId = getParentDbId(r);
    return dbId && idToName.has(dbId.replace(/-/g, ""));
  });

  const limited = filtered.slice(0, limit);

  const rows = limited.map((page: any) => {
    // Find the title property
    let title = "";
    if (page.properties) {
      for (const prop of Object.values(page.properties)) {
        if ((prop as any).type === "title") {
          title = extractProperty(prop);
          break;
        }
      }
    }

    const dbId = getParentDbId(page) ?? "";
    const dbName = idToName.get(dbId.replace(/-/g, "")) ?? "unknown";
    const edited = page.last_edited_time?.slice(0, 10) ?? "";

    return { Title: title, Database: dbName, "Last Edited": edited };
  });

  const table = formatTable(rows, ["Title", "Database", "Last Edited"], { fetched: limited.length });

  const has_more = filtered.length > limited.length;
  const paginationLine = has_more
    ? `⚠️ TRUNCATED - fetched ${limited.length} items but MORE EXIST. Increase limit to get more results.`
    : `✅ COMPLETE - all ${limited.length} matching items returned.`;

  if (rows.length === 0) return `${table}\n${paginationLine}`;
  return `<untrusted_content>\n${table}\n</untrusted_content>\n${paginationLine}`;
}
