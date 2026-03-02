import { Client } from "@notionhq/client";
import type { DatabaseConfig } from "./config.js";

export class NotionAPI {
  public client: Client;
  private token: string;
  private schemaCache: Map<string, Record<string, string>> = new Map();

  constructor(token: string) {
    this.client = new Client({ auth: token });
    this.token = token;
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

  async queryDatabase(databaseId: string, params: { filter?: any; sorts?: any[]; page_size?: number; start_cursor?: string }): Promise<{ results: any[]; next_cursor: string | null; has_more: boolean }> {
    const body: any = { page_size: params.page_size ?? 100 };
    if (params.filter) body.filter = params.filter;
    if (params.sorts) body.sorts = params.sorts;
    if (params.start_cursor) body.start_cursor = params.start_cursor;

    // SDK v5 dataSources.query uses a newer API version that doesn't work for
    // all databases. Use raw fetch with the stable 2022-06-28 API version.
    return this.retryWithBackoff(async () => {
      const res = await fetch(`https://api.notion.com/v1/databases/${databaseId}/query`, {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${this.token}`,
          "Notion-Version": "2022-06-28",
          "Content-Type": "application/json",
        },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const errBody: any = await res.json().catch(() => ({ message: res.statusText }));
        const e: any = new Error(errBody.message || "Notion API error");
        e.status = res.status;
        e.code = errBody.code;
        throw e;
      }
      return res.json() as Promise<{ results: any[]; next_cursor: string | null; has_more: boolean }>;
    });
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
