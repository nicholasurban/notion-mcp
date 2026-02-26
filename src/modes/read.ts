import type { ToolContext, ToolParams } from "../tool.js";

export async function handleRead(ctx: ToolContext, params: ToolParams): Promise<string> {
  return JSON.stringify({ error: "read mode not implemented" });
}
