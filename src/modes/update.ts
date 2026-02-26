import type { ToolContext, ToolParams } from "../tool.js";

export async function handleUpdate(ctx: ToolContext, params: ToolParams): Promise<string> {
  return JSON.stringify({ error: "update mode not implemented" });
}
