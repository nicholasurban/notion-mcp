import { describe, it, expect, vi } from "vitest";
import { NotionAPI, AIError } from "../api.js";

describe("NotionAPI", () => {
  it("constructs with token", () => {
    const api = new NotionAPI("ntn_test");
    expect(api).toBeDefined();
  });

  it("resolveDatabase maps friendly name to ID", () => {
    const databases = {
      "content-calendar": { id: "abc123", description: "", fields: [] as string[], allowedActions: ["query" as const, "read" as const, "create" as const, "update" as const] },
    };
    const api = new NotionAPI("ntn_test");
    expect(api.resolveDatabase("content-calendar", databases)).toBe("abc123");
  });

  it("resolveDatabase throws AIError for unknown name", () => {
    const api = new NotionAPI("ntn_test");
    try {
      api.resolveDatabase("unknown", {});
      expect.fail("should throw");
    } catch (err) {
      expect(err).toBeInstanceOf(AIError);
      expect((err as AIError).suggestion).toContain("Available");
    }
  });

  it("retry logic backs off on 429", async () => {
    const api = new NotionAPI("ntn_test");
    let attempts = 0;
    const fn = async () => {
      attempts++;
      if (attempts < 3) {
        const err: any = new Error("rate limited");
        err.status = 429;
        throw err;
      }
      return "ok";
    };
    const result = await api.retryWithBackoff(fn, 3, 10); // fast delays for test
    expect(result).toBe("ok");
    expect(attempts).toBe(3);
  });

  it("retry gives up after max attempts", async () => {
    const api = new NotionAPI("ntn_test");
    const fn = async () => {
      const err: any = new Error("rate limited");
      err.status = 429;
      throw err;
    };
    await expect(api.retryWithBackoff(fn, 3, 10)).rejects.toThrow("rate limited");
  });

  it("paginateAll collects all pages up to limit", async () => {
    const api = new NotionAPI("ntn_test");
    let call = 0;
    const fetcher = async (cursor?: string) => {
      call++;
      if (call === 1) return { results: [1, 2, 3], next_cursor: "abc", has_more: true };
      return { results: [4, 5], next_cursor: null, has_more: false };
    };
    const { results, has_more } = await api.paginateAll(fetcher, 10);
    expect(results).toEqual([1, 2, 3, 4, 5]);
    expect(has_more).toBe(false);
  });

  it("paginateAll respects limit", async () => {
    const api = new NotionAPI("ntn_test");
    const fetcher = async () => ({ results: [1, 2, 3, 4, 5], next_cursor: "abc", has_more: true });
    const { results, has_more } = await api.paginateAll(fetcher, 3);
    expect(results).toEqual([1, 2, 3]);
    expect(has_more).toBe(true);
  });
});

describe("DatabaseCountCache", () => {
  it("returns null for uncached database", () => {
    const api = new NotionAPI("ntn_test");
    expect(api.getEstimatedCount("db-123")).toBeNull();
  });

  it("returns count after refresh", async () => {
    const api = new NotionAPI("ntn_test");
    let call = 0;
    vi.spyOn(api, "queryDatabase").mockImplementation(async () => {
      call++;
      if (call === 1) return { results: Array(100).fill({ id: "x" }), next_cursor: "c2", has_more: true };
      return { results: Array(46).fill({ id: "x" }), next_cursor: null, has_more: false };
    });

    await api.refreshCount("db-123");
    expect(api.getEstimatedCount("db-123")).toBe(146);
  });

  it("returns stale count within TTL", async () => {
    const api = new NotionAPI("ntn_test");
    vi.spyOn(api, "queryDatabase").mockResolvedValue({
      results: Array(50).fill({ id: "x" }),
      next_cursor: null,
      has_more: false,
    });

    await api.refreshCount("db-123");
    expect(api.getEstimatedCount("db-123")).toBe(50);
    expect(api.getEstimatedCount("db-123")).toBe(50);
  });

  it("returns null after TTL expires", async () => {
    const api = new NotionAPI("ntn_test");
    vi.spyOn(api, "queryDatabase").mockResolvedValue({
      results: Array(10).fill({ id: "x" }),
      next_cursor: null,
      has_more: false,
    });

    await api.refreshCount("db-123");
    expect(api.getEstimatedCount("db-123")).toBe(10);

    api.expireCountCache("db-123");
    expect(api.getEstimatedCount("db-123")).toBeNull();
  });
});

describe("AIError", () => {
  it("has suggestion field", () => {
    const err = new AIError("not found", "try searching");
    expect(err.message).toBe("not found");
    expect(err.suggestion).toBe("try searching");
    expect(err.name).toBe("AIError");
  });
});
