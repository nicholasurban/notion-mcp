# Notion MCP Server — Design

General-purpose Notion MCP server for reading/writing pages and databases. Config-driven, token-optimized, remote-only.

Separate from `notion-affiliate` (which stays as-is for affiliate database operations).

## 1. Tool Definition

Single tool `notion` with 6 modes:

| Mode | Purpose |
|---|---|
| `help` | Load detailed docs for a mode on demand (reads `.md` from `docs/`) |
| `search` | Search across all configured databases |
| `query` | Query a specific database with filters/sorts |
| `read` | Get page content as markdown |
| `create` | Create page in a database or under a parent page |
| `update` | Update page properties and/or body content |

### Parameters

Shared across modes; each mode uses a subset:

- `mode` — required, enum
- `database` — friendly name from config (query/create)
- `page_id` — for read/update
- `query` — search text (search) or filter expression (query)
- `sort` — optional sort config
- `properties` — key-value object (create/update)
- `content` — markdown string (create/update body)
- `topic` — which mode to get docs for (help)
- `limit` — max results, default 50, auto-paginate internally

### Estimated context cost: ~400-500 tokens

## 2. Config File

`config.json` at project root, passed as `CONFIG_JSON` (base64) env var in Coolify:

```json
{
  "databases": {
    "content-calendar": {
      "id": "abc123...",
      "description": "Blog post planning and status tracking",
      "fields": ["Title", "Status", "Publish Date", "Category", "Author"],
      "allowedActions": ["query", "read", "create", "update"]
    },
    "podcast-tracker": {
      "id": "def456...",
      "description": "Episode planning and guest management",
      "fields": ["Episode", "Guest", "Status", "Record Date"]
    }
  }
}
```

Rules:
- `allowedActions` defaults to all if omitted
- `fields` = hint list for AI prioritization; all properties still accessible
- `description` returned in search/help so AI knows which database to target
- Database IDs never exposed to AI — friendly names only
- `search` spans all configured databases automatically
- Adding a database = one config entry + restart

## 3. Token Optimization

### Layer 1 — Schema cost (~400 tokens always loaded)
- Single tool, 1-sentence description, no examples in schema
- Parameter descriptions ≤ 8 words each
- Strip `default` and optional field metadata from JSON Schema
- Database names injected into `database` enum dynamically from config at startup

### Layer 2 — On-demand docs (0 tokens until requested)
- `help` mode reads `docs/{mode}.md` from disk
- Contains filter syntax, property types, examples, error recovery
- AI calls `help` on first use of unfamiliar mode; subsequent calls use conversation cache

### Layer 3 — Response compression
- Query results as pipe-delimited compact tables (not JSON)
- Page content as markdown (3-5x smaller than block JSON)
- Rich-text truncated to 200 chars with `…`
- `total: N, returned: N` counts — no verbose pagination metadata
- Omit null/empty properties entirely
- Property values as plain text — no type wrappers

### Layer 4 — Write efficiency
- Accept markdown input, convert to Notion blocks server-side
- Batch: `update` accepts array of page IDs for bulk property changes
- Schema validation server-side; errors return suggestion, not full schema

### Cost comparison

| What | Tokens |
|---|---|
| Tool definition (always) | ~400 |
| `help` call (on demand) | ~300-500/mode |
| Query result (10 rows) | ~200-400 |
| Page read (avg) | ~500-2000 |
| Official local server | ~6,600 always |

## 4. Security & Resilience

### Indirect prompt injection defense
- All Notion page content wrapped in `<untrusted_content>` tags before returning

### Config-enforced access control
- Only databases in `config.json` accessible
- `allowedActions` enforced server-side before Notion API calls
- Database IDs never exposed to AI

### Help tool path traversal prevention
- `topic` validated against whitelist of known mode names

### Error handling
- AI-friendly errors with `suggestion` field:
  ```json
  {"error": "Database 'podcasts' not found", "suggestion": "Available: content-calendar, podcast-tracker"}
  ```
- Rate limits → exponential backoff (3 attempts: 1s/2s/4s), clear error if exhausted
- Invalid filters → error + hint to call `help`

### Input validation
- Page IDs validated as UUID format
- Markdown content size-capped (100KB)
- Property values type-checked against cached database schema

## 5. Markdown I/O & Deployment

### Markdown conversion
- `read` converts Notion blocks → markdown (headings, lists, toggles, code, tables, callouts, images, dividers)
- `create`/`update` accept markdown → server converts to Notion blocks
- Unsupported block types rendered as `[unsupported: {type}]`

### Deployment
- Remote-only on Coolify (Hetzner)
- DNS: `notion.mcp.outliyr.com` → `46.224.152.172` (DNS-only, Coolify handles SSL)
- Auth: OAuth 2.1 + PKCE (Claude.ai/iOS), static Bearer (Claude Code)
- Env vars: `NOTION_TOKEN`, `CONFIG_JSON` (base64), auth secrets
- Health: `GET /health` → config status + Notion API reachability
- Registered as `notion-remote` in Claude Code (HTTP transport)

### Tech stack
- Node.js + TypeScript
- `@notionhq/client` SDK
- Express for HTTP transport
- MCP SDK (`@modelcontextprotocol/sdk`)
