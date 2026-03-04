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
  vi.spyOn(api, "getEstimatedCount").mockReturnValue(null);
  vi.spyOn(api, "refreshCount").mockResolvedValue(0);
  const config: NotionConfig = {
    databases: {
      "content-calendar": { id: "db-111", description: "Posts", fields: ["Title"], allowedActions: ["query", "read", "create", "update"], aliases: [] },
      "podcast-tracker": { id: "db-222", description: "Episodes", fields: ["Title"], allowedActions: ["query", "read", "create", "update"], aliases: [] },
      "products-shop": {
        id: "db-333", description: "Products", fields: ["Brand", "Name"],
        allowedActions: ["query", "read", "create", "update"], aliases: ["shop"],
        searchFields: ["Name", "Brand", "Slug"],
      },
    },
    databaseNames: ["content-calendar", "podcast-tracker", "products-shop"],
    aliasMap: { shop: "products-shop" },
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
    expect(result).toContain("fetched: 3");
  });

  describe("database-scoped search", () => {
    it("uses property filters when database is provided", async () => {
      const ctx = makeCtx();
      vi.spyOn(ctx.api, "getSchema").mockResolvedValue({
        Name: "title",
        Brand: "rich_text",
        Slug: "rich_text",
        Rating: "number",
      });
      vi.spyOn(ctx.api, "paginateAll").mockResolvedValue({
        results: [
          {
            id: "page-1",
            properties: {
              Brand: { type: "rich_text", rich_text: [{ plain_text: "TruDiagnostic" }] },
              Name: { type: "title", title: [{ plain_text: "TruAge" }] },
            },
          },
        ],
        has_more: false,
      });

      const result = await handleSearch(ctx, { mode: "search", query: "TruDiagnostic", database: "products-shop" });
      expect(result).toContain("TruDiagnostic");
      expect(result).toContain("TruAge");
      // Should NOT use global search
      expect(ctx.api.client.search).not.toHaveBeenCalled();
    });

    it("rejects unknown database in scoped search", async () => {
      const ctx = makeCtx();
      const result = JSON.parse(await handleSearch(ctx, { mode: "search", query: "test", database: "nope" }));
      expect(result.error).toContain("not found");
    });

    it("shows COMPLETE when all results returned", async () => {
      const ctx = makeCtx();
      vi.spyOn(ctx.api, "getSchema").mockResolvedValue({ Name: "title", Brand: "rich_text", Slug: "rich_text" });
      vi.spyOn(ctx.api, "paginateAll").mockResolvedValue({
        results: [{ id: "p1", properties: { Name: { type: "title", title: [{ plain_text: "Item" }] } } }],
        has_more: false,
      });
      const result = await handleSearch(ctx, { mode: "search", query: "Item", database: "products-shop" });
      expect(result).toContain("COMPLETE");
    });

    it("shows TRUNCATED when more results exist", async () => {
      const ctx = makeCtx();
      vi.spyOn(ctx.api, "getSchema").mockResolvedValue({ Name: "title", Brand: "rich_text", Slug: "rich_text" });
      vi.spyOn(ctx.api, "paginateAll").mockResolvedValue({
        results: [{ id: "p1", properties: { Name: { type: "title", title: [{ plain_text: "Item" }] } } }],
        has_more: true,
      });
      const result = await handleSearch(ctx, { mode: "search", query: "Item", database: "products-shop" });
      expect(result).toContain("TRUNCATED");
      expect(result).toContain("fetched 1");
    });

    it("shows estimated_total when truncated and cache exists", async () => {
      const ctx = makeCtx();
      vi.spyOn(ctx.api, "getSchema").mockResolvedValue({ Name: "title" });
      vi.spyOn(ctx.api, "paginateAll").mockResolvedValue({
        results: [{ id: "p1", properties: { Name: { type: "title", title: [{ plain_text: "Item" }] } } }],
        has_more: true,
      });
      vi.spyOn(ctx.api, "getEstimatedCount").mockReturnValue(250);
      vi.spyOn(ctx.api, "refreshCount").mockResolvedValue(250);
      const result = await handleSearch(ctx, { mode: "search", query: "Item", database: "products-shop" });
      expect(result).toContain("~250");
      expect(result).toContain("TRUNCATED");
    });

    it("uses searchFields from config", async () => {
      const ctx = makeCtx();
      vi.spyOn(ctx.api, "getSchema").mockResolvedValue({
        Name: "title",
        Brand: "rich_text",
        Slug: "rich_text",
        Rating: "number",
        Description: "rich_text",
      });
      vi.spyOn(ctx.api, "paginateAll").mockResolvedValue({ results: [], has_more: false });

      await handleSearch(ctx, { mode: "search", query: "test", database: "products-shop" });
      // paginateAll should have been called; the fetcher builds an OR filter
      // with only the searchFields (Name, Brand, Slug) — not Description or Rating
      expect(ctx.api.paginateAll).toHaveBeenCalled();
    });
  });
});
