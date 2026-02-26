import type { ToolContext, ToolParams } from "../tool.js";

export async function handleQuery(ctx: ToolContext, params: ToolParams): Promise<string> {
  return JSON.stringify({ error: "query mode not implemented" });
}
