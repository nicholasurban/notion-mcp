import { z } from "zod";
import type { NotionAPI, AIError } from "./api.js";
import type { NotionConfig } from "./config.js";

export const TOOL_NAME = "notion";
export const TOOL_DESCRIPTION = "Read/write Notion pages and databases. Use help mode first for syntax.";

export function buildToolSchema(databaseNames: string[]) {
  return {
    mode: z.enum(["help", "search", "query", "read", "create", "update"])
      .describe("Operation mode"),
    database: z.enum(databaseNames as [string, ...string[]])
      .optional().describe("Database name"),
    page_id: z.string().optional().describe("Page UUID"),
    query: z.string().optional().describe("Search or filter text"),
    sort: z.string().optional().describe("Sort config JSON"),
    properties: z.record(z.string(), z.unknown()).optional()
      .describe("Key-value properties"),
    content: z.string().optional().describe("Markdown body"),
    topic: z.string().optional().describe("Help topic name"),
    limit: z.number().int().min(1).max(200).default(50).optional()
      .describe("Max results"),
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
};

export interface ToolContext {
  api: NotionAPI;
  config: NotionConfig;
}

export async function toolHandler(ctx: ToolContext, params: ToolParams): Promise<string> {
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
