import { describe, it, expect, vi } from "vitest";
import { handleUpdate } from "../modes/update.js";
import { NotionAPI } from "../api.js";
import type { NotionConfig } from "../config.js";

function makeCtx() {
  const api = new NotionAPI("fake");
  api.client.pages = {
    ...api.client.pages,
    update: vi.fn().mockResolvedValue({ id: "page-1" }),
    retrieve: vi.fn().mockResolvedValue({
      id: "page-1",
      parent: { type: "database_id", database_id: "db-111" },
      properties: {},
    }),
  } as any;
  api.client.blocks = {
    ...api.client.blocks,
    children: {
      list: vi.fn().mockResolvedValue({ results: [{ id: "block-1" }], next_cursor: null, has_more: false }),
      append: vi.fn().mockResolvedValue({}),
    },
    delete: vi.fn().mockResolvedValue({}),
  } as any;
  api.getSchema = vi.fn().mockResolvedValue({
    Title: "title",
    Status: "select",
  });
  const config: NotionConfig = {
    databases: {
      "content-calendar": {
        id: "db-111",
        description: "Posts",
        fields: ["Title", "Status"],
        allowedActions: ["query", "read", "create", "update"],
        aliases: [],
        writeAllowlist: ["Title", "Status"],
      },
    },
    databaseNames: ["content-calendar"],
    aliasMap: {},
  };
  return { api, config };
}

describe("handleUpdate", () => {
  it("requires page_id", async () => {
    const ctx = makeCtx();
    const result = JSON.parse(await handleUpdate(ctx, { mode: "update" }));
    expect(result.error).toBeDefined();
  });

  it("validates page_id format", async () => {
    const ctx = makeCtx();
    const result = JSON.parse(await handleUpdate(ctx, { mode: "update", page_id: "bad" }));
    expect(result.error).toContain("UUID");
  });

  it("updates properties", async () => {
    const ctx = makeCtx();
    const result = JSON.parse(await handleUpdate(ctx, {
      mode: "update",
      page_id: "12345678-1234-1234-1234-123456789abc",
      properties: { Status: "Published" },
    }));
    expect(result.updated).toBe(true);
    expect(ctx.api.client.pages.update).toHaveBeenCalled();
  });

  it("replaces content when content provided", async () => {
    const ctx = makeCtx();
    await handleUpdate(ctx, {
      mode: "update",
      page_id: "12345678-1234-1234-1234-123456789abc",
      content: "# New Content",
    });
    // Should delete existing blocks then append new ones
    expect(ctx.api.client.blocks.delete).toHaveBeenCalled();
    expect(ctx.api.client.blocks.children.append).toHaveBeenCalled();
  });

  it("rejects oversized content", async () => {
    const ctx = makeCtx();
    const result = JSON.parse(await handleUpdate(ctx, {
      mode: "update",
      page_id: "12345678-1234-1234-1234-123456789abc",
      content: "x".repeat(100_001),
    }));
    expect(result.error).toContain("100KB");
  });

  it("handles batch update via page_ids in properties", async () => {
    const ctx = makeCtx();
    const result = JSON.parse(await handleUpdate(ctx, {
      mode: "update",
      page_id: "12345678-1234-1234-1234-123456789abc",
      properties: {
        page_ids: ["12345678-1234-1234-1234-123456789abc", "22345678-1234-1234-1234-123456789abc"],
        Status: "Archived",
      },
    }));
    expect(result.updated).toBe(2);
  });

  it("requires at least properties or content", async () => {
    const ctx = makeCtx();
    const result = JSON.parse(await handleUpdate(ctx, {
      mode: "update",
      page_id: "12345678-1234-1234-1234-123456789abc",
    }));
    expect(result.error).toContain("properties or content");
  });

  it("rejects properties not in writeAllowlist", async () => {
    const ctx = makeCtx();
    ctx.config.databases["content-calendar"].writeAllowlist = ["Title"];
    const result = JSON.parse(await handleUpdate(ctx, {
      mode: "update",
      page_id: "12345678-1234-1234-1234-123456789abc",
      properties: { Status: "Published" },
    }));
    expect(result.error).toContain("writeAllowlist");
    expect(result.error).toContain("Status");
  });

  it("allows properties in writeAllowlist", async () => {
    const ctx = makeCtx();
    ctx.config.databases["content-calendar"].writeAllowlist = ["Title", "Status"];
    const result = JSON.parse(await handleUpdate(ctx, {
      mode: "update",
      page_id: "12345678-1234-1234-1234-123456789abc",
      properties: { Status: "Published" },
    }));
    expect(result.updated).toBe(true);
  });

  it("strips empty values from properties", async () => {
    const ctx = makeCtx();
    ctx.config.databases["content-calendar"].writeAllowlist = ["Title", "Status"];
    const result = JSON.parse(await handleUpdate(ctx, {
      mode: "update",
      page_id: "12345678-1234-1234-1234-123456789abc",
      properties: { Status: "Published", Title: "" },
    }));
    expect(result.updated).toBe(true);
    const updateCall = (ctx.api.client.pages.update as any).mock.calls[0][0];
    expect(updateCall.properties).not.toHaveProperty("Title");
  });

  it("handles clear_fields by sending empty values for those fields only", async () => {
    const ctx = makeCtx();
    ctx.config.databases["content-calendar"].writeAllowlist = ["Title", "Status"];
    const result = JSON.parse(await handleUpdate(ctx, {
      mode: "update",
      page_id: "12345678-1234-1234-1234-123456789abc",
      properties: { Title: "New Title" },
      clear_fields: ["Status"],
    }));
    expect(result.updated).toBe(true);
    // Verify Status was sent as explicit clear
    const updateCall = (ctx.api.client.pages.update as any).mock.calls[0][0];
    expect(updateCall.properties.Status).toBeDefined();
  });
});
