import { readFileSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";
import type { ToolParams } from "../tool.js";

const VALID_TOPICS = ["query", "search", "read", "create", "update"];
const __dirname = dirname(fileURLToPath(import.meta.url));
const DOCS_DIR = join(__dirname, "..", "docs");

export async function handleHelp(params: ToolParams): Promise<string> {
  const topic = params.topic;

  if (!topic) {
    return JSON.stringify({ topics: VALID_TOPICS, hint: "Call with topic param" });
  }

  if (!VALID_TOPICS.includes(topic)) {
    return JSON.stringify({
      error: `Invalid topic: ${topic}`,
      suggestion: `Valid topics: ${VALID_TOPICS.join(", ")}`,
    });
  }

  try {
    const content = readFileSync(join(DOCS_DIR, `${topic}.md`), "utf-8");
    return JSON.stringify({ topic, docs: content });
  } catch {
    return JSON.stringify({ error: `Docs not found for ${topic}` });
  }
}
