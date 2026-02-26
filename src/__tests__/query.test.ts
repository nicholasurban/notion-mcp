import { describe, it, expect, vi } from "vitest";
import { handleQuery } from "../modes/query.js";
import { NotionAPI } from "../api.js";
import type { NotionConfig } from "../config.js";

function makeCtx(queryResults: any[] = []) {
  const api = new NotionAPI("fake");
  api.client.databases = {
    ...api.client.databases,
    query: vi.fn().mockResolvedValue({
      results: queryResults,
      next_cursor: null,
      has_more: false,
    }),
  } as any;
  const config: NotionConfig = {
    databases: {
      "content-calendar": {
        id: "db-111",
        description: "Posts",
        fields: ["Title", "Status", "Date"],
        allowedActions: ["query", "read", "create", "update"],
      },
      "read-only-db": {
        id: "db-222",
        description: "Archive",
        fields: ["Title"],
        allowedActions: ["query", "read"],
      },
    },
    databaseNames: ["content-calendar", "read-only-db"],
  };
  return { api, config };
}

describe("handleQuery", () => {
  it("requires database param", async () => {
    const ctx = makeCtx();
    const result = JSON.parse(await handleQuery(ctx, { mode: "query" }));
    expect(result.error).toBeDefined();
    expect(result.suggestion).toContain("Available");
  });

  it("rejects unknown database", async () => {
    const ctx = makeCtx();
    const result = JSON.parse(await handleQuery(ctx, { mode: "query", database: "nope" }));
    expect(result.error).toContain("not found");
  });

  it("queries database and returns formatted table", async () => {
    const ctx = makeCtx([
      {
        id: "page-1",
        properties: {
          Title: { type: "title", title: [{ plain_text: "My Post" }] },
          Status: { type: "select", select: { name: "Draft" } },
          Date: { type: "date", date: { start: "2026-03-01" } },
        },
      },
    ]);
    const result = await handleQuery(ctx, { mode: "query", database: "content-calendar" });
    expect(result).toContain("My Post");
    expect(result).toContain("Draft");
    expect(result).toContain("2026-03-01");
  });

  it("passes filter to Notion API", async () => {
    const ctx = makeCtx([]);
    await handleQuery(ctx, {
      mode: "query",
      database: "content-calendar",
      query: '{"property": "Status", "status": {"equals": "Published"}}',
    });
    expect(ctx.api.client.databases.query).toHaveBeenCalledWith(
      expect.objectContaining({
        filter: { property: "Status", status: { equals: "Published" } },
      })
    );
  });

  it("passes sort to Notion API", async () => {
    const ctx = makeCtx([]);
    await handleQuery(ctx, {
      mode: "query",
      database: "content-calendar",
      sort: '{"property": "Date", "direction": "descending"}',
    });
    expect(ctx.api.client.databases.query).toHaveBeenCalledWith(
      expect.objectContaining({
        sorts: [{ property: "Date", direction: "descending" }],
      })
    );
  });

  it("checks allowedActions", async () => {
    const ctx = makeCtx();
    ctx.config.databases["content-calendar"].allowedActions = ["read"] as any;
    const result = JSON.parse(await handleQuery(ctx, { mode: "query", database: "content-calendar" }));
    expect(result.error).toContain("not allowed");
  });

  it("handles empty results", async () => {
    const ctx = makeCtx([]);
    const result = await handleQuery(ctx, { mode: "query", database: "content-calendar" });
    expect(result).toContain("No results");
  });
});
