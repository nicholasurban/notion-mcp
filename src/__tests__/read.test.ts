import { describe, it, expect, vi } from "vitest";
import { handleRead } from "../modes/read.js";
import { NotionAPI } from "../api.js";
import type { NotionConfig } from "../config.js";

function makeCtx(pageProps: any = {}, blocks: any[] = []) {
  const api = new NotionAPI("fake");
  api.client.pages = {
    ...api.client.pages,
    retrieve: vi.fn().mockResolvedValue({
      id: "page-1",
      properties: pageProps,
    }),
  } as any;
  api.client.blocks = {
    ...api.client.blocks,
    children: {
      list: vi.fn().mockResolvedValue({
        results: blocks,
        next_cursor: null,
        has_more: false,
      }),
    },
  } as any;
  const config: NotionConfig = { databases: {}, databaseNames: [] };
  return { api, config };
}

describe("handleRead", () => {
  it("requires page_id", async () => {
    const ctx = makeCtx();
    const result = JSON.parse(await handleRead(ctx, { mode: "read" }));
    expect(result.error).toBeDefined();
  });

  it("validates page_id format", async () => {
    const ctx = makeCtx();
    const result = JSON.parse(await handleRead(ctx, { mode: "read", page_id: "not-a-uuid" }));
    expect(result.error).toContain("UUID");
  });

  it("returns properties and markdown content", async () => {
    const ctx = makeCtx(
      {
        Title: { type: "title", title: [{ plain_text: "My Page" }] },
        Status: { type: "select", select: { name: "Draft" } },
      },
      [{ type: "paragraph", paragraph: { rich_text: [{ plain_text: "Hello world" }] } }]
    );
    const result = JSON.parse(await handleRead(ctx, { mode: "read", page_id: "12345678-1234-1234-1234-123456789abc" }));
    expect(result.properties.Title).toBe("My Page");
    expect(result.properties.Status).toBe("Draft");
    expect(result.content).toContain("Hello world");
    expect(result.content).toContain("<untrusted_content>");
  });

  it("omits empty properties", async () => {
    const ctx = makeCtx({
      Title: { type: "title", title: [{ plain_text: "Test" }] },
      Notes: { type: "rich_text", rich_text: [] },
    });
    const result = JSON.parse(await handleRead(ctx, { mode: "read", page_id: "12345678-1234-1234-1234-123456789abc" }));
    expect(result.properties.Title).toBe("Test");
    expect(result.properties.Notes).toBeUndefined();
  });
});
