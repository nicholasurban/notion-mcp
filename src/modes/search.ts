import type { ToolContext, ToolParams } from "../tool.js";

export async function handleSearch(ctx: ToolContext, params: ToolParams): Promise<string> {
  return JSON.stringify({ error: "search mode not implemented" });
}
