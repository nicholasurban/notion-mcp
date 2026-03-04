# Honest Pagination Metadata — Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Replace the deceptive `total` footer with honest `fetched` count, add a cached estimated database size with 5-minute TTL, and warn agents about data staleness.

**Architecture:** Add a `DatabaseCountCache` class to `api.ts` that lazily counts database rows (ID-only pagination, no property extraction). Query/search modes read from this cache to populate an `estimated_total` field in the footer. Cache expires after 5 minutes. Truncated results trigger a background refresh.

**Tech Stack:** TypeScript, Vitest, Notion API (raw fetch)

---

### Task 1: Update `format.ts` — Rename `total` to `fetched`, add `estimated_total`

**Files:**
- Modify: `src/format.ts`
- Test: `src/__tests__/format.test.ts`

**Step 1: Write failing tests**

In `src/__tests__/format.test.ts`, replace the existing `"includes count footer"` test and add new ones:

```typescript
it("shows fetched count (not total)", () => {
  const rows = [{ Title: "A" }];
  const result = formatTable(rows, ["Title"], { fetched: 1 });
  expect(result).toContain("fetched: 1");
  expect(result).not.toContain("total:");
});

it("shows estimated_total when provided", () => {
  const rows = [{ Title: "A" }];
  const result = formatTable(rows, ["Title"], { fetched: 1, estimatedTotal: 346 });
  expect(result).toContain("fetched: 1");
  expect(result).toContain("estimated_total: ~346");
});

it("shows staleness warning with estimated_total", () => {
  const rows = [{ Title: "A" }];
  const result = formatTable(rows, ["Title"], { fetched: 1, estimatedTotal: 346 });
  expect(result).toContain("CACHED");
  expect(result).toContain("stale");
});

it("omits estimated_total when not provided", () => {
  const rows = [{ Title: "A" }];
  const result = formatTable(rows, ["Title"], { fetched: 1 });
  expect(result).not.toContain("estimated_total");
  expect(result).not.toContain("CACHED");
});
```

**Step 2: Run tests to verify they fail**

Run: `cd /tmp/notion-mcp && npx vitest run src/__tests__/format.test.ts`
Expected: FAIL — old opts type has `total` not `fetched`/`estimatedTotal`

**Step 3: Update `format.ts`**

Replace the entire file:

```typescript
export function formatTable(
  rows: Record<string, string>[],
  columns?: string[],
  opts?: { fetched?: number; estimatedTotal?: number | null }
): string {
  if (rows.length === 0) return "No results";

  const cols = columns ?? Object.keys(rows[0]);

  const activeCols = cols.filter((col) =>
    rows.some((row) => (row[col] ?? "").trim() !== "")
  );

  if (activeCols.length === 0) return "No results";

  const header = activeCols.join(" | ");

  const dataRows = rows.map((row) =>
    activeCols.map((col) => truncateCell(row[col] ?? "")).join(" | ")
  );

  let footer = `fetched: ${opts?.fetched ?? rows.length}`;
  if (opts?.estimatedTotal != null) {
    footer += ` | estimated_total: ~${opts.estimatedTotal} | ⚠️ CACHED count (5m TTL, may be stale — verify critical decisions)`;
  }

  return [header, ...dataRows, footer].join("\n");
}

function truncateCell(value: string, max = 80): string {
  return value.length > max ? value.slice(0, max) + "…" : value;
}
```

**Step 4: Run tests to verify they pass**

Run: `cd /tmp/notion-mcp && npx vitest run src/__tests__/format.test.ts`
Expected: PASS (except possibly the old `total: 10` test which we replaced)

**Step 5: Commit**

```bash
cd /tmp/notion-mcp && git add src/format.ts src/__tests__/format.test.ts
git commit -m "feat: rename total→fetched in footer, add estimatedTotal support"
```

---

### Task 2: Add `DatabaseCountCache` to `api.ts`

**Files:**
- Modify: `src/api.ts`
- Test: `src/__tests__/api.test.ts`

**Step 1: Write failing tests**

Add to `src/__tests__/api.test.ts`:

```typescript
describe("DatabaseCountCache", () => {
  it("returns null for uncached database", () => {
    const api = new NotionAPI("ntn_test");
    expect(api.getEstimatedCount("db-123")).toBeNull();
  });

  it("returns count after refresh", async () => {
    const api = new NotionAPI("ntn_test");
    // Mock queryDatabase to return 2 pages of results
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
    // Second call should still return cached value
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

    // Manually expire the cache entry
    api.expireCountCache("db-123");
    expect(api.getEstimatedCount("db-123")).toBeNull();
  });
});
```

**Step 2: Run tests to verify they fail**

Run: `cd /tmp/notion-mcp && npx vitest run src/__tests__/api.test.ts`
Expected: FAIL — `getEstimatedCount`, `refreshCount`, `expireCountCache` do not exist

**Step 3: Add cache methods to `NotionAPI` class in `src/api.ts`**

Add these fields and methods to the `NotionAPI` class (after the existing `schemaCache` field):

```typescript
// After: private schemaCache: Map<string, Record<string, string>> = new Map();
private countCache: Map<string, { count: number; timestamp: number }> = new Map();
private static COUNT_TTL_MS = 5 * 60 * 1000; // 5 minutes

getEstimatedCount(databaseId: string): number | null {
  const entry = this.countCache.get(databaseId);
  if (!entry) return null;
  if (Date.now() - entry.timestamp > NotionAPI.COUNT_TTL_MS) {
    this.countCache.delete(databaseId);
    return null;
  }
  return entry.count;
}

async refreshCount(databaseId: string): Promise<number> {
  let count = 0;
  let cursor: string | undefined;
  // Paginate with no filter, page_size 100, counting only
  while (true) {
    const page = await this.retryWithBackoff(() =>
      this.queryDatabase(databaseId, {
        page_size: 100,
        start_cursor: cursor,
      })
    );
    count += page.results.length;
    if (!page.has_more || !page.next_cursor) break;
    cursor = page.next_cursor;
  }
  this.countCache.set(databaseId, { count, timestamp: Date.now() });
  return count;
}

/** Manually expire a cache entry (used in tests) */
expireCountCache(databaseId: string): void {
  this.countCache.delete(databaseId);
}
```

**Step 4: Run tests to verify they pass**

Run: `cd /tmp/notion-mcp && npx vitest run src/__tests__/api.test.ts`
Expected: PASS

**Step 5: Commit**

```bash
cd /tmp/notion-mcp && git add src/api.ts src/__tests__/api.test.ts
git commit -m "feat: add DatabaseCountCache with 5-min TTL to NotionAPI"
```

---

### Task 3: Update `query.ts` — Use cached count in pagination metadata

**Files:**
- Modify: `src/modes/query.ts`
- Test: `src/__tests__/query.test.ts`

**Step 1: Write failing tests**

Update existing tests and add new ones in `src/__tests__/query.test.ts`.

Update the `makeCtx` helper — add `getEstimatedCount` and `refreshCount` mocks:

```typescript
// Add after the existing paginateAll mock in makeCtx:
vi.spyOn(api, "getEstimatedCount").mockReturnValue(null);
vi.spyOn(api, "refreshCount").mockResolvedValue(0);
```

Add new tests:

```typescript
it("shows estimated_total when cache has count and results are truncated", async () => {
  const ctx = makeCtx([]);
  vi.spyOn(ctx.api, "paginateAll").mockResolvedValue({
    results: [{ id: "p1", properties: { Title: { type: "title", title: [{ plain_text: "X" }] } } }],
    has_more: true,
  });
  vi.spyOn(ctx.api, "getEstimatedCount").mockReturnValue(346);
  const result = await handleQuery(ctx, { mode: "query", database: "content-calendar" });
  expect(result).toContain("~346");
  expect(result).toContain("TRUNCATED");
  expect(result).toContain("CACHED");
});

it("shows estimated_total unknown when no cache and truncated", async () => {
  const ctx = makeCtx([]);
  vi.spyOn(ctx.api, "paginateAll").mockResolvedValue({
    results: [{ id: "p1", properties: { Title: { type: "title", title: [{ plain_text: "X" }] } } }],
    has_more: true,
  });
  vi.spyOn(ctx.api, "getEstimatedCount").mockReturnValue(null);
  const result = await handleQuery(ctx, { mode: "query", database: "content-calendar" });
  expect(result).toContain("TRUNCATED");
  expect(result).toContain("estimated_total: unknown");
});

it("triggers background count refresh when truncated and no cache", async () => {
  const ctx = makeCtx([]);
  vi.spyOn(ctx.api, "paginateAll").mockResolvedValue({
    results: [{ id: "p1", properties: { Title: { type: "title", title: [{ plain_text: "X" }] } } }],
    has_more: true,
  });
  vi.spyOn(ctx.api, "getEstimatedCount").mockReturnValue(null);
  const refreshSpy = vi.spyOn(ctx.api, "refreshCount").mockResolvedValue(346);
  await handleQuery(ctx, { mode: "query", database: "content-calendar" });
  expect(refreshSpy).toHaveBeenCalledWith("db-111");
});

it("does not show estimated_total when COMPLETE", async () => {
  const ctx = makeCtx([
    { id: "page-1", properties: { Title: { type: "title", title: [{ plain_text: "Post 1" }] } } },
  ]);
  const result = await handleQuery(ctx, { mode: "query", database: "content-calendar" });
  expect(result).toContain("COMPLETE");
  expect(result).not.toContain("estimated_total");
  expect(result).not.toContain("CACHED");
});
```

Also update the existing `"shows TRUNCATED when more results exist"` test to expect `fetched` instead of `returned`:

```typescript
it("shows TRUNCATED when more results exist", async () => {
  const ctx = makeCtx([]);
  vi.spyOn(ctx.api, "paginateAll").mockResolvedValue({
    results: [{ id: "p1", properties: { Title: { type: "title", title: [{ plain_text: "X" }] } } }],
    has_more: true,
  });
  const result = await handleQuery(ctx, { mode: "query", database: "content-calendar" });
  expect(result).toContain("TRUNCATED");
  expect(result).toContain("fetched 1");
});
```

**Step 2: Run tests to verify they fail**

Run: `cd /tmp/notion-mcp && npx vitest run src/__tests__/query.test.ts`
Expected: FAIL — query.ts still uses old `total` opts and doesn't call `getEstimatedCount`

**Step 3: Update `src/modes/query.ts`**

Replace the table/pagination section (lines 108-116) with:

```typescript
  // Get estimated total from cache
  const estimatedTotal = has_more ? ctx.api.getEstimatedCount(dbConfig.id) : null;

  // Trigger background count refresh if truncated and no cache
  if (has_more && estimatedTotal === null) {
    ctx.api.refreshCount(dbConfig.id).catch(() => {}); // fire-and-forget
  }

  const table = formatTable(rows, [...allColumns], {
    fetched: rows.length,
    estimatedTotal: has_more ? estimatedTotal : undefined,
  });

  let paginationLine: string;
  if (has_more) {
    const countInfo = estimatedTotal != null ? `of ~${estimatedTotal} items (cached count, may be stale)` : "items (estimated_total: unknown — will be cached after this request)";
    paginationLine = `⚠️ TRUNCATED — fetched ${rows.length} ${countInfo}. Increase limit (max 500) or add filters to narrow results.`;
  } else {
    paginationLine = `✅ COMPLETE — all ${rows.length} matching items returned.`;
  }

  if (rows.length === 0) return `${table}\n${paginationLine}`;
  return `<untrusted_content>\n${table}\n</untrusted_content>\n${paginationLine}`;
```

**Step 4: Run tests to verify they pass**

Run: `cd /tmp/notion-mcp && npx vitest run src/__tests__/query.test.ts`
Expected: PASS

**Step 5: Commit**

```bash
cd /tmp/notion-mcp && git add src/modes/query.ts src/__tests__/query.test.ts
git commit -m "feat: add estimated_total and staleness warning to query mode"
```

---

### Task 4: Update `search.ts` — Same cached count treatment

**Files:**
- Modify: `src/modes/search.ts`
- Test: `src/__tests__/search.test.ts`

**Step 1: Write failing tests**

Add to the `"database-scoped search"` describe block in `src/__tests__/search.test.ts`:

```typescript
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
```

Also update existing TRUNCATED/COMPLETE tests to expect `fetched` instead of `returned`.

Add `getEstimatedCount` and `refreshCount` mocks to `makeCtx`:

```typescript
vi.spyOn(api, "getEstimatedCount").mockReturnValue(null);
vi.spyOn(api, "refreshCount").mockResolvedValue(0);
```

**Step 2: Run tests to verify they fail**

Run: `cd /tmp/notion-mcp && npx vitest run src/__tests__/search.test.ts`
Expected: FAIL

**Step 3: Update `src/modes/search.ts`**

Apply the same pattern as query.ts to the `databaseSearch` function — replace the table/pagination section (lines 95-103):

```typescript
  const estimatedTotal = has_more ? ctx.api.getEstimatedCount(dbConfig.id) : null;

  if (has_more && estimatedTotal === null) {
    ctx.api.refreshCount(dbConfig.id).catch(() => {});
  }

  const table = formatTable(rows, [...allColumns], {
    fetched: rows.length,
    estimatedTotal: has_more ? estimatedTotal : undefined,
  });

  let paginationLine: string;
  if (has_more) {
    const countInfo = estimatedTotal != null ? `of ~${estimatedTotal} items (cached count, may be stale)` : "items (estimated_total: unknown — will be cached after this request)";
    paginationLine = `⚠️ TRUNCATED — fetched ${rows.length} ${countInfo}. Increase limit (max 500) or add filters to narrow results.`;
  } else {
    paginationLine = `✅ COMPLETE — all ${rows.length} matching items returned.`;
  }

  if (rows.length === 0) return `${table}\n${paginationLine}`;
  return `<untrusted_content>\n${table}\n</untrusted_content>\n${paginationLine}`;
```

Also update the `globalSearch` function — replace its footer/pagination lines (lines 149-157) with the same pattern but using `fetched` opts:

```typescript
  const table = formatTable(rows, ["Title", "Database", "Last Edited"], { fetched: limited.length });

  const has_more = filtered.length > limited.length;
  const paginationLine = has_more
    ? `⚠️ TRUNCATED — fetched ${limited.length} items but MORE EXIST. Increase limit to get more results.`
    : `✅ COMPLETE — all ${limited.length} matching items returned.`;
```

(Global search doesn't get estimated_total since it spans multiple databases.)

**Step 4: Run tests to verify they pass**

Run: `cd /tmp/notion-mcp && npx vitest run src/__tests__/search.test.ts`
Expected: PASS

**Step 5: Commit**

```bash
cd /tmp/notion-mcp && git add src/modes/search.ts src/__tests__/search.test.ts
git commit -m "feat: add estimated_total and staleness warning to search mode"
```

---

### Task 5: Raise limit max in `tool.ts`

**Files:**
- Modify: `src/tool.ts`
- Test: `src/__tests__/tool.test.ts`

**Step 1: Write failing test**

Add to `src/__tests__/tool.test.ts` (or verify the schema allows 500):

```typescript
it("allows limit up to 500", () => {
  const schema = buildToolSchema(["test-db"]);
  const result = schema.limit.safeParse(500);
  expect(result.success).toBe(true);
});
```

**Step 2: Run test to verify it fails**

Run: `cd /tmp/notion-mcp && npx vitest run src/__tests__/tool.test.ts`
Expected: FAIL — max is currently 200

**Step 3: Update `src/tool.ts` line 31**

Change:
```typescript
limit: z.number().int().min(1).max(200).default(50).optional()
```
To:
```typescript
limit: z.number().int().min(1).max(500).default(50).optional()
```

**Step 4: Run test to verify it passes**

Run: `cd /tmp/notion-mcp && npx vitest run src/__tests__/tool.test.ts`
Expected: PASS

**Step 5: Commit**

```bash
cd /tmp/notion-mcp && git add src/tool.ts src/__tests__/tool.test.ts
git commit -m "feat: raise query limit max from 200 to 500"
```

---

### Task 6: Run full test suite and build

**Step 1: Run all tests**

Run: `cd /tmp/notion-mcp && npx vitest run`
Expected: All tests PASS

**Step 2: Build**

Run: `cd /tmp/notion-mcp && npm run build`
Expected: Clean TypeScript compilation, no errors

**Step 3: Fix any failures**

If any test or build fails, fix and re-run.

**Step 4: Final commit if any fixes needed**

```bash
cd /tmp/notion-mcp && git add -A && git commit -m "fix: resolve test/build issues from pagination metadata changes"
```

---

### Task 7: Push, deploy to Coolify, verify

**Step 1: Push to GitHub**

```bash
cd /tmp/notion-mcp && git push origin main
```

**Step 2: Trigger Coolify redeploy**

```bash
curl -s -X POST -H "Authorization: Bearer 1|OckxTu8dSQ3RUfRGpOZnRuFOtsBIG2TiTV5L5aLGc292ec78" \
  "http://46.224.152.172:8000/api/v1/applications/o8kk84o0gcswc8kg444wok4o/restart"
```

**Step 3: Wait for deploy, then test via MCP**

Query a database with a low limit (e.g., 5) and verify:
- Footer shows `fetched: 5` (not `total: 5`)
- TRUNCATED message appears with `estimated_total: unknown` on first request
- Second request shows `estimated_total: ~N` with cached count and staleness warning
- COMPLETE message appears when all results fit within limit
