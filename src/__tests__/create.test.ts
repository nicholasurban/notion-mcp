import { describe, it, expect, vi } from "vitest";
import { handleCreate } from "../modes/create.js";
import { NotionAPI } from "../api.js";
import type { NotionConfig } from "../config.js";

function makeCtx() {
  const api = new NotionAPI("fake");
  api.client.pages = {
    ...api.client.pages,
    create: vi.fn().mockResolvedValue({
      id: "new-page-1",
      url: "https://notion.so/new-page-1",
    }),
  } as any;
  // Mock getSchema
  api.getSchema = vi.fn().mockResolvedValue({
    Title: "title",
    Status: "select",
    Tags: "multi_select",
    Notes: "rich_text",
    Count: "number",
    Done: "checkbox",
    Link: "url",
  });
  const config: NotionConfig = {
    databases: {
      "content-calendar": {
        id: "db-111",
        description: "Posts",
        fields: ["Title", "Status"],
        allowedActions: ["query", "read", "create", "update"],
      },
      "read-only": {
        id: "db-222",
        description: "Archive",
        fields: ["Title"],
        allowedActions: ["query", "read"],
      },
    },
    databaseNames: ["content-calendar", "read-only"],
  };
  return { api, config };
}

describe("handleCreate", () => {
  it("requires database param", async () => {
    const ctx = makeCtx();
    const result = JSON.parse(await handleCreate(ctx, { mode: "create" }));
    expect(result.error).toBeDefined();
  });

  it("checks allowedActions", async () => {
    const ctx = makeCtx();
    const result = JSON.parse(await handleCreate(ctx, { mode: "create", database: "read-only", properties: { Title: "Test" } }));
    expect(result.error).toContain("not allowed");
  });

  it("requires properties", async () => {
    const ctx = makeCtx();
    const result = JSON.parse(await handleCreate(ctx, { mode: "create", database: "content-calendar" }));
    expect(result.error).toContain("properties");
  });

  it("creates page with properties", async () => {
    const ctx = makeCtx();
    const result = JSON.parse(await handleCreate(ctx, {
      mode: "create",
      database: "content-calendar",
      properties: { Title: "New Post", Status: "Draft" },
    }));
    expect(result.created).toBe(true);
    expect(result.page_id).toBe("new-page-1");
    expect(ctx.api.client.pages.create).toHaveBeenCalled();
  });

  it("creates page with markdown content", async () => {
    const ctx = makeCtx();
    await handleCreate(ctx, {
      mode: "create",
      database: "content-calendar",
      properties: { Title: "Post" },
      content: "# Hello\n\nSome text",
    });
    const call = (ctx.api.client.pages.create as any).mock.calls[0][0];
    expect(call.children).toBeDefined();
    expect(call.children.length).toBeGreaterThan(0);
  });

  it("rejects oversized content", async () => {
    const ctx = makeCtx();
    const result = JSON.parse(await handleCreate(ctx, {
      mode: "create",
      database: "content-calendar",
      properties: { Title: "Big" },
      content: "x".repeat(100_001),
    }));
    expect(result.error).toContain("100KB");
  });
});
