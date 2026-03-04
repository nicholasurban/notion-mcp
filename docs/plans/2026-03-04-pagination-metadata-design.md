# Honest Pagination Metadata for notion-mcp

**Date**: 2026-03-04
**Status**: Approved

## Problem

1. Footer says `returned: 200 | total: 200` — `total` equals `returned`, deceptive
2. No way to know real database size without exhaustive pagination
3. Agents make decisions on incomplete data without realizing it

## Changes

### 1. `format.ts` — Rename `total` → `fetched`, add `estimated_total`

Footer becomes:
- Truncated with cache: `fetched: 50 | estimated_total: ~346 | ⚠️ CACHED count (5m TTL, may be stale — verify critical decisions)`
- Truncated without cache: `fetched: 50 | estimated_total: unknown`
- Complete: `fetched: 50 | ✅ COMPLETE`

### 2. `api.ts` — Add `DatabaseCountCache` with 5-min TTL

- In-memory `Map<databaseId, { count: number, timestamp: number }>`
- `getEstimatedCount(databaseId)`: returns cached count or `null`
- `refreshCount(databaseId)`: paginates with no filter, counting IDs only (no property extraction). Stores result with timestamp.
- On any query/search returning `has_more: true`, trigger background count refresh if cache is expired/missing
- 5-minute TTL

### 3. `query.ts` + `search.ts` — Enhanced pagination line

Truncated: `⚠️ TRUNCATED — fetched N of ~M items (cached count, may be stale). Increase limit (max 500) or add filters to narrow results.`
Complete: `✅ COMPLETE — all N matching items returned.`

### 4. `tool.ts` schema — Raise limit max from 200 to 500

`paginateAll` handles multi-page fetches, safe to raise.

## Files to modify

1. `src/api.ts` — Add count cache methods
2. `src/format.ts` — Rename total→fetched, add estimated_total
3. `src/modes/query.ts` — Pass estimated count, improve pagination message
4. `src/modes/search.ts` — Same as query.ts
5. `src/tool.ts` — Raise limit max to 500
