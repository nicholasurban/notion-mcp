import type { ToolParams } from "../tool.js";

export async function handleHelp(params: ToolParams): Promise<string> {
  return JSON.stringify({ error: "help mode not implemented" });
}
