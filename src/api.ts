import { Client } from "@notionhq/client";
import type { DatabaseConfig } from "./config.js";

export class NotionAPI {
  public client: Client;
  private schemaCache: Map<string, Record<string, string>> = new Map();

  constructor(token: string) {
    this.client = new Client({ auth: token });
  }

  resolveDatabase(name: string, databases: Record<string, DatabaseConfig>): string {
    const db = databases[name];
    if (!db) {
      const available = Object.keys(databases).join(", ");
      throw new AIError(`Database '${name}' not found`, `Available: ${available}`);
    }
    return db.id;
  }

  async retryWithBackoff<T>(fn: () => Promise<T>, maxAttempts = 3, baseDelay = 1000): Promise<T> {
    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      try {
        return await fn();
      } catch (err: any) {
        if (err.status === 429 && attempt < maxAttempts) {
          await new Promise((r) => setTimeout(r, baseDelay * Math.pow(2, attempt - 1)));
          continue;
        }
        throw err;
      }
    }
    throw new Error("unreachable");
  }

  async getSchema(databaseId: string): Promise<Record<string, string>> {
    const cached = this.schemaCache.get(databaseId);
    if (cached) return cached;
    const db = await this.retryWithBackoff(() =>
      this.client.databases.retrieve({ database_id: databaseId })
    );
    const schema: Record<string, string> = {};
    if ("properties" in db) {
      for (const [name, prop] of Object.entries(db.properties as Record<string, { type: string }>)) {
        schema[name] = prop.type;
      }
    }
    this.schemaCache.set(databaseId, schema);
    return schema;
  }

  async paginateAll<T>(
    fetcher: (cursor?: string) => Promise<{ results: T[]; next_cursor: string | null; has_more: boolean }>,
    limit: number
  ): Promise<T[]> {
    const all: T[] = [];
    let cursor: string | undefined;
    while (all.length < limit) {
      const page = await this.retryWithBackoff(() => fetcher(cursor));
      all.push(...page.results);
      if (!page.has_more || !page.next_cursor) break;
      cursor = page.next_cursor;
    }
    return all.slice(0, limit);
  }
}

export class AIError extends Error {
  suggestion: string;
  constructor(message: string, suggestion: string) {
    super(message);
    this.name = "AIError";
    this.suggestion = suggestion;
  }
}
