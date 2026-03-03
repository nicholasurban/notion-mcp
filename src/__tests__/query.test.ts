import { describe, it, expect, vi } from "vitest";
import { handleQuery } from "../modes/query.js";
import { NotionAPI } from "../api.js";
import type { NotionConfig } from "../config.js";

function makeCtx(queryResults: any[] = [], hasMore = false) {
  const api = new NotionAPI("fake");
  vi.spyOn(api, "queryDatabase").mockResolvedValue({
    results: queryResults,
    next_cursor: hasMore ? "cursor-2" : null,
    has_more: hasMore,
  });
  vi.spyOn(api, "paginateAll").mockImplementation(async (fetcher, limit) => {
    // Simulate single page for most tests
    const page = await fetcher(undefined);
    return { results: page.results.slice(0, limit), has_more: false };
  });
  const config: NotionConfig = {
    databases: {
      "content-calendar": {
        id: "db-111",
        description: "Posts",
        fields: ["Title", "Status", "Date"],
        allowedActions: ["query", "read", "create", "update"],
        aliases: [],
      },
      "read-only-db": {
        id: "db-222",
        description: "Archive",
        fields: ["Title"],
        allowedActions: ["query", "read"],
        aliases: [],
      },
    },
    databaseNames: ["content-calendar", "read-only-db"],
    aliasMap: {},
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

  it("passes filter via paginateAll", async () => {
    const ctx = makeCtx([]);
    await handleQuery(ctx, {
      mode: "query",
      database: "content-calendar",
      query: '{"property": "Status", "status": {"equals": "Published"}}',
    });
    expect(ctx.api.paginateAll).toHaveBeenCalled();
    // Verify the fetcher calls queryDatabase with the filter
    expect(ctx.api.queryDatabase).toHaveBeenCalledWith(
      "db-111",
      expect.objectContaining({
        filter: { property: "Status", status: { equals: "Published" } },
      })
    );
  });

  it("passes sort via paginateAll", async () => {
    const ctx = makeCtx([]);
    await handleQuery(ctx, {
      mode: "query",
      database: "content-calendar",
      sort: '{"property": "Date", "direction": "descending"}',
    });
    expect(ctx.api.queryDatabase).toHaveBeenCalledWith(
      "db-111",
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

  it("uses paginateAll with correct limit", async () => {
    const ctx = makeCtx([]);
    await handleQuery(ctx, { mode: "query", database: "content-calendar", limit: 150 });
    expect(ctx.api.paginateAll).toHaveBeenCalledWith(expect.any(Function), 150);
  });

  it("shows COMPLETE when all results returned", async () => {
    const ctx = makeCtx([
      { id: "page-1", properties: { Title: { type: "title", title: [{ plain_text: "Post 1" }] } } },
    ]);
    const result = await handleQuery(ctx, { mode: "query", database: "content-calendar" });
    expect(result).toContain("COMPLETE");
  });

  it("shows TRUNCATED when more results exist", async () => {
    const ctx = makeCtx([]);
    vi.spyOn(ctx.api, "paginateAll").mockResolvedValue({
      results: [{ id: "p1", properties: { Title: { type: "title", title: [{ plain_text: "X" }] } } }],
      has_more: true,
    });
    const result = await handleQuery(ctx, { mode: "query", database: "content-calendar" });
    expect(result).toContain("TRUNCATED");
    expect(result).toContain("MORE EXIST");
  });
});
