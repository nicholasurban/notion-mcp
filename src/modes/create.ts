import type { ToolContext, ToolParams } from "../tool.js";

export async function handleCreate(ctx: ToolContext, params: ToolParams): Promise<string> {
  return JSON.stringify({ error: "create mode not implemented" });
}
