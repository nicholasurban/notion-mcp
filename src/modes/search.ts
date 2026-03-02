import type { ToolContext, ToolParams } from "../tool.js";
import { formatTable } from "../format.js";
import { extractProperty } from "../properties.js";

export async function handleSearch(ctx: ToolContext, params: ToolParams): Promise<string> {
  if (!params.query) {
    return JSON.stringify({ error: "query parameter is required for search mode" });
  }

  const limit = params.limit ?? 50;

  // Build reverse map: database_id → friendly name (normalize to no hyphens)
  const idToName = new Map<string, string>();
  for (const [name, db] of Object.entries(ctx.config.databases)) {
    idToName.set(db.id.replace(/-/g, ""), name);
  }

  const response = await ctx.api.client.search({
    query: params.query,
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

  const table = formatTable(rows, ["Title", "Database", "Last Edited"], { total: filtered.length });

  if (rows.length === 0) return table;

  return `<untrusted_content>\n${table}\n</untrusted_content>`;
}
