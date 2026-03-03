import type { ToolContext, ToolParams } from "../tool.js";
import { extractProperty } from "../properties.js";
import { formatTable } from "../format.js";

export async function handleQuery(ctx: ToolContext, params: ToolParams): Promise<string> {
  // Validate database param
  if (!params.database) {
    const available = ctx.config.databaseNames.join(", ");
    return JSON.stringify({
      error: "database parameter is required for query mode",
      suggestion: `Available: ${available}`,
    });
  }

  // Resolve friendly name to database config
  const dbConfig = ctx.config.databases[params.database];
  if (!dbConfig) {
    const available = ctx.config.databaseNames.join(", ");
    return JSON.stringify({
      error: `Database '${params.database}' not found`,
      suggestion: `Available: ${available}`,
    });
  }

  // Check allowedActions
  if (!dbConfig.allowedActions.includes("query")) {
    return JSON.stringify({
      error: `Action 'query' is not allowed on database '${params.database}'`,
      suggestion: `Allowed actions: ${dbConfig.allowedActions.join(", ")}`,
    });
  }

  // Parse filter from query param
  let filter: any;
  if (params.query) {
    try {
      filter = JSON.parse(params.query);
    } catch {
      return JSON.stringify({
        error: "Invalid filter JSON in query parameter",
        suggestion: 'Provide a valid Notion filter object, e.g. {"property": "Status", "status": {"equals": "Draft"}}',
      });
    }
  }

  // Parse sort
  let sorts: any[] | undefined;
  if (params.sort) {
    try {
      const parsed = JSON.parse(params.sort);
      sorts = Array.isArray(parsed) ? parsed : [parsed];
    } catch {
      return JSON.stringify({
        error: "Invalid sort JSON in sort parameter",
        suggestion: 'Provide a valid sort object, e.g. {"property": "Date", "direction": "descending"}',
      });
    }
  }

  const limit = params.limit ?? 50;

  // Paginate through all results up to limit
  const { results, has_more } = await ctx.api.paginateAll(
    (cursor) => ctx.api.queryDatabase(dbConfig.id, {
      filter,
      sorts,
      page_size: Math.min(limit, 100),
      start_cursor: cursor,
    }),
    limit
  );

  // Extract properties into rows
  const priorityFields = dbConfig.fields ?? [];

  const rows = results.map((page: any) => {
    const row: Record<string, string> = {};

    // Add priority fields first
    for (const field of priorityFields) {
      if (page.properties?.[field]) {
        row[field] = extractProperty(page.properties[field]);
      }
    }

    // Add remaining non-empty properties
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

  // Build column order: priority fields first, then any extras
  const allColumns = new Set<string>(priorityFields);
  for (const row of rows) {
    for (const key of Object.keys(row)) {
      allColumns.add(key);
    }
  }

  const table = formatTable(rows, [...allColumns], { total: results.length });

  const paginationLine = has_more
    ? `⚠️ TRUNCATED — returned ${rows.length} items but MORE EXIST in database. Increase limit or paginate to get all results.`
    : `✅ COMPLETE — all ${rows.length} matching items returned.`;

  if (rows.length === 0) return `${table}\n${paginationLine}`;
  return `<untrusted_content>\n${table}\n</untrusted_content>\n${paginationLine}`;
}
