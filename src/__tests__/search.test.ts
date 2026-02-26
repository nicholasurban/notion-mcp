import { describe, it, expect, vi } from "vitest";
import { handleSearch } from "../modes/search.js";
import { NotionAPI } from "../api.js";
import type { NotionConfig } from "../config.js";

function makeCtx(searchResults: any[] = []) {
  const api = new NotionAPI("fake");
  api.client.search = vi.fn().mockResolvedValue({
    results: searchResults,
    next_cursor: null,
    has_more: false,
  });
  const config: NotionConfig = {
    databases: {
      "content-calendar": { id: "db-111", description: "Posts", fields: ["Title"], allowedActions: ["query", "read", "create", "update"] },
      "podcast-tracker": { id: "db-222", description: "Episodes", fields: ["Title"], allowedActions: ["query", "read", "create", "update"] },
    },
    databaseNames: ["content-calendar", "podcast-tracker"],
  };
  return { api, config };
}

describe("handleSearch", () => {
  it("requires query param", async () => {
    const ctx = makeCtx();
    const result = JSON.parse(await handleSearch(ctx, { mode: "search" }));
    expect(result.error).toBeDefined();
  });

  it("searches and returns formatted table", async () => {
    const ctx = makeCtx([
      {
        object: "page",
        id: "page-1",
        parent: { type: "database_id", database_id: "db-111" },
        properties: { Name: { type: "title", title: [{ plain_text: "Test Post" }] } },
        last_edited_time: "2026-03-01T00:00:00.000Z",
      },
    ]);
    const result = await handleSearch(ctx, { mode: "search", query: "test" });
    expect(result).toContain("Test Post");
    expect(result).toContain("content-calendar");
  });

  it("filters out pages from non-configured databases", async () => {
    const ctx = makeCtx([
      {
        object: "page",
        id: "page-1",
        parent: { type: "database_id", database_id: "db-999" },
        properties: { Name: { type: "title", title: [{ plain_text: "Rogue Page" }] } },
        last_edited_time: "2026-03-01T00:00:00.000Z",
      },
    ]);
    const result = await handleSearch(ctx, { mode: "search", query: "rogue" });
    expect(result).not.toContain("Rogue Page");
    expect(result).toContain("No results");
  });

  it("respects limit", async () => {
    const pages = Array.from({ length: 10 }, (_, i) => ({
      object: "page",
      id: `page-${i}`,
      parent: { type: "database_id", database_id: "db-111" },
      properties: { Name: { type: "title", title: [{ plain_text: `Post ${i}` }] } },
      last_edited_time: "2026-03-01T00:00:00.000Z",
    }));
    const ctx = makeCtx(pages);
    const result = await handleSearch(ctx, { mode: "search", query: "post", limit: 3 });
    expect(result).toContain("returned: 3");
  });
});
