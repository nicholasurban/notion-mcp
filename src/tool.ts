import { z } from "zod";
import type { NotionAPI, AIError } from "./api.js";
import type { NotionConfig, DatabaseConfig } from "./config.js";
import type { AuditLog } from "./audit.js";

export const TOOL_NAME = "notion";

export function buildToolDescription(databases: Record<string, DatabaseConfig>): string {
  const lines = ["Read/write Notion pages and databases.\n\nDatabases:"];
  for (const [name, db] of Object.entries(databases)) {
    lines.push(`- ${name}: ${db.description}`);
  }
  lines.push("\nUse help mode for filter/sort syntax.");
  return lines.join("\n");
}

export function buildToolSchema(databaseNames: string[], aliasNames: string[] = []) {
  const allDbValues = [...databaseNames, ...aliasNames];
  return {
    mode: z.enum(["help", "search", "query", "read", "create", "update"])
      .describe("Operation mode"),
    database: z.enum(allDbValues as [string, ...string[]])
      .optional().describe("Database name or alias (e.g. 'shop' → products-shop)"),
    page_id: z.string().optional().describe("Page UUID"),
    query: z.string().optional().describe("Search or filter text"),
    sort: z.string().optional().describe("Sort config JSON"),
    properties: z.record(z.string(), z.unknown()).optional()
      .describe("Key-value properties"),
    content: z.string().optional().describe("Markdown body"),
    topic: z.string().optional().describe("Help topic name"),
    limit: z.number().int().min(1).max(500).default(50).optional()
      .describe("Max results"),
    clear_fields: z.array(z.string()).optional()
      .describe("Fields to explicitly clear (required to intentionally empty a field)"),
  };
}

export type ToolParams = {
  mode: string;
  database?: string;
  page_id?: string;
  query?: string;
  sort?: string;
  properties?: Record<string, unknown>;
  content?: string;
  topic?: string;
  limit?: number;
  clear_fields?: string[];
};

export interface ToolContext {
  api: NotionAPI;
  config: NotionConfig;
  auditLog?: AuditLog;
}

/** Resolve alias to canonical database name if needed */
function resolveAlias(params: ToolParams, config: NotionConfig): void {
  if (!params.database) return;
  // Already a canonical name
  if (config.databases[params.database]) return;
  // Try alias lookup
  const canonical = config.aliasMap[params.database.toLowerCase()];
  if (canonical) {
    params.database = canonical;
  }
}

export async function toolHandler(ctx: ToolContext, params: ToolParams): Promise<string> {
  // Resolve aliases before routing
  resolveAlias(params, ctx.config);

  try {
    switch (params.mode) {
      case "help": {
        const { handleHelp } = await import("./modes/help.js");
        return await handleHelp(params);
      }
      case "search": {
        const { handleSearch } = await import("./modes/search.js");
        return await handleSearch(ctx, params);
      }
      case "query": {
        const { handleQuery } = await import("./modes/query.js");
        return await handleQuery(ctx, params);
      }
      case "read": {
        const { handleRead } = await import("./modes/read.js");
        return await handleRead(ctx, params);
      }
      case "create": {
        const { handleCreate } = await import("./modes/create.js");
        return await handleCreate(ctx, params);
      }
      case "update": {
        const { handleUpdate } = await import("./modes/update.js");
        return await handleUpdate(ctx, params);
      }
      default:
        return JSON.stringify({ error: `Unknown mode: ${params.mode}` });
    }
  } catch (err: any) {
    if (err.name === "AIError") {
      return JSON.stringify({ error: err.message, suggestion: err.suggestion });
    }
    return JSON.stringify({ error: err.message ?? "Unknown error" });
  }
}
