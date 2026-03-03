# notion-mcp

Custom Notion MCP server — config-driven, token-optimized, remote-only. Single `notion` tool with 6 modes for reading/writing pages and databases.

## Why Not the Official Notion MCP?

| | This server | [Official](https://github.com/makenotion/notion-mcp-server) |
|---|---|---|
| Always-on context cost | **~750 tokens** (1 tool, 10 params, DB directory) | **~6,600 tokens** (22 tools) |
| Database access | Config-controlled whitelist | Full workspace traversal |
| Content format | Markdown (3-5x smaller) | Raw Notion block JSON |
| Response format | Pipe-delimited tables | Verbose JSON |
| XPIA defense | `<untrusted_content>` wrapping | None |
| On-demand docs | `help` mode loads syntax per-mode | All docs always loaded |
| Deployment | Remote-only (HTTP) | Local stdio (being sunset) |

The official server loads 22 separate tools into every conversation. This server uses a single composite tool with mode dispatch, keeping the schema at ~400 tokens and loading detailed docs only when the AI calls `help`.

## Modes

| Mode | Purpose | Required Params |
|---|---|---|
| `help` | Load docs for a mode on demand | `topic` |
| `search` | Search across databases (global or scoped with property-level matching) | `query`, optionally `database` |
| `query` | Query a specific database with filters/sorts | `database`, optionally `query`, `sort` |
| `read` | Get page content as markdown | `page_id` |
| `create` | Create page in a database | `database`, `properties`, optionally `content` |
| `update` | Update page properties and/or body | `page_id`, optionally `properties`, `content` |

### Examples

```jsonc
// Search across all databases (title-only)
{"mode": "search", "query": "cold plunge"}

// Search within a specific database (matches all text properties)
{"mode": "search", "query": "TruDiagnostic", "database": "products-shop"}

// Query a specific database with filters
{"mode": "query", "database": "written-content", "query": "{\"property\": \"Status\", \"status\": {\"equals\": \"Published\"}}"}

// Read a page as markdown
{"mode": "read", "page_id": "abc123-def456-..."}

// Create a page
{"mode": "create", "database": "tasks", "properties": {"Name": "Review draft", "Due": "2026-03-01"}, "content": "## Notes\n- Check intro\n- Update CTA"}

// Update properties + replace body content
{"mode": "update", "page_id": "abc123-...", "properties": {"Status": "Done"}, "content": "## Updated body\nNew content here"}

// Get help on filter syntax
{"mode": "help", "topic": "query"}
```

## Config

Create a JSON config defining which databases the server can access. Base64-encode it and set as the `CONFIG_JSON` env var.

```json
{
  "databases": {
    "content-calendar": {
      "id": "abc123def456...",
      "description": "Blog post planning and status tracking",
      "fields": ["Title", "Status", "Publish Date", "Category"],
      "allowedActions": ["query", "read", "create", "update"]
    },
    "tasks": {
      "id": "def456abc789...",
      "description": "Task management and project tracking",
      "fields": ["Name", "Due", "Assignee", "Done"]
    }
  }
}
```

| Field | Required | Description |
|---|---|---|
| `id` | Yes | Notion database ID (32-char hex, no dashes) |
| `description` | No | Surfaced in tool description to help AI pick the right database |
| `fields` | No | Priority fields for output formatting |
| `allowedActions` | No | Defaults to all 4 if omitted |
| `aliases` | No | Alternative names the AI can use (e.g. `["shop", "products"]`) |
| `searchFields` | No | Property names to search in database-scoped search mode |
| `writeAllowlist` | No | Property names allowed in create/update. If non-empty, unlisted properties are rejected. Empty = no enforcement (default). |

### Write Safety

When `writeAllowlist` is configured for a database:

- **Allowlist enforcement**: Only listed properties can be sent in `create` or `update`. Unlisted properties return an error before any Notion API call.
- **Empty-value stripping**: `null`, `""`, and `[]` values are automatically removed to prevent accidental field clearing.
- **Explicit clearing**: To intentionally clear a field, use the `clear_fields` parameter: `{"clear_fields": ["Deal URL", "Discount Code"]}`. Fields in `clear_fields` must also be in the allowlist.
- **Audit log**: All writes are logged to append-only JSONL files at `AUDIT_LOG_PATH` (default `/data/audit`).

### Pagination Metadata

Every `query` and `search` response includes a trailing status line:
- `✅ COMPLETE — all N matching items returned.`
- `⚠️ TRUNCATED — returned N items but MORE EXIST in database. Increase limit or paginate to get all results.`

**Rules:**
- Only databases listed in config are accessible (security boundary)
- Database IDs are never exposed to the AI — only friendly names
- `search` mode spans all configured databases (or scoped to one with property-level matching)
- Adding a database = one config entry + restart

### Encoding the config

```bash
# macOS
base64 < config.json | tr -d '\n'

# Linux
base64 -w0 config.json
```

## Environment Variables

| Variable | Required | Description |
|---|---|---|
| `NOTION_TOKEN` | Yes | Notion integration token (`ntn_...`) |
| `CONFIG_JSON` | Yes | Base64-encoded config JSON |
| `PORT` | No | HTTP port (default `3000`) |
| `MCP_AUTH_TOKEN` | No | Static bearer token for Claude Code |
| `MCP_OAUTH_CLIENT_ID` | Yes | OAuth 2.1 client ID |
| `MCP_OAUTH_CLIENT_SECRET` | Yes | OAuth 2.1 client secret |
| `PUBLIC_URL` | Yes | Public URL for OAuth discovery metadata |

## Auth

Two auth methods, used simultaneously:

- **Static Bearer token** — for Claude Code desktop: `Authorization: Bearer <MCP_AUTH_TOKEN>`
- **OAuth 2.1 + PKCE** — for Claude.ai and Claude iOS app. Discovery at `/.well-known/oauth-authorization-server`.

## Token Optimization Strategy

**Layer 1 — Schema (~750 tokens always loaded)**
- Single tool with 10 parameters
- Dynamic tool description lists all databases with descriptions
- Database names + aliases injected as dynamic enum from config

**Layer 2 — On-demand docs (0 tokens until requested)**
- `help` mode reads markdown files from `docs/` per-mode
- Contains filter syntax, property types, examples
- AI calls `help` on first use; subsequent calls use conversation cache

**Layer 3 — Response compression**
- Query results as pipe-delimited tables (not JSON)
- Page content as markdown (not block objects)
- Null/empty properties omitted entirely
- Rich text truncated to 200 chars with `…`

**Layer 4 — Write efficiency**
- Markdown input → server-side conversion to Notion blocks
- Batch update: accepts array of page IDs for bulk property changes
- Validation errors return suggestion, not full schema

## Security

- **Config-enforced access control** — only databases in config are accessible, `allowedActions` enforced server-side
- **XPIA defense** — all Notion page content wrapped in `<untrusted_content>` tags before returning to AI
- **Path traversal prevention** — `help` mode topic validated against whitelist
- **AI-friendly errors** — structured `{error, suggestion}` responses guide recovery
- **Rate limit handling** — exponential backoff (3 attempts: 1s/2s/4s) on Notion 429s
- **Input validation** — page IDs validated as UUID, content size-capped at 100KB

## Development

```bash
npm install
npm test           # 122 tests
npm run build      # TypeScript → dist/
```

## Deployment

### Docker

```bash
docker build -t notion-mcp .
docker run -p 3000:3000 \
  -e NOTION_TOKEN=ntn_xxx \
  -e CONFIG_JSON=$(base64 < config.json | tr -d '\n') \
  -e MCP_AUTH_TOKEN=$(openssl rand -base64 32) \
  -e MCP_OAUTH_CLIENT_ID=notion-mcp-xxx \
  -e MCP_OAUTH_CLIENT_SECRET=$(openssl rand -base64 32) \
  -e PUBLIC_URL=https://your-domain.com \
  notion-mcp
```

### Health check

```
GET /health → {"status":"ok","databases":14,"databaseNames":[...],"notion":"connected"}
```

### Register in Claude Code

```bash
claude mcp add-json notion-remote '{"type":"http","url":"https://your-domain.com/mcp","headers":{"Authorization":"Bearer YOUR_TOKEN"}}' --scope user
```

### Connect on Claude.ai / iOS

Use the OAuth credentials:
- URL: `https://your-domain.com/mcp`
- Client ID: your `MCP_OAUTH_CLIENT_ID`
- Client Secret: your `MCP_OAUTH_CLIENT_SECRET`

## Notion Integration Setup

1. Go to [notion.so/my-integrations](https://www.notion.so/my-integrations)
2. Create (or reuse) an internal integration
3. Copy the token (`ntn_...`) → set as `NOTION_TOKEN`
4. For each database you want to access: open it in Notion → "..." → "Connections" → add your integration
5. Add the database to your `config.json` with a friendly name

## Architecture

```
src/
  index.ts          # Express HTTP server + MCP SDK setup
  config.ts         # Zod-validated config loader
  api.ts            # Notion API client (retry, cache, pagination)
  tool.ts           # Single tool schema + mode dispatch (incl. clear_fields param)
  safety.ts         # Write allowlist validation + empty-value stripping
  audit.ts          # Append-only JSONL write audit log
  markdown.ts       # Bidirectional Notion blocks ↔ markdown
  properties.ts     # Property value extraction (all types)
  format.ts         # Pipe-delimited table formatter
  build-properties.ts  # Schema-aware property builder for writes
  oauth.ts          # OAuth 2.1 + PKCE + static bearer auth
  modes/
    help.ts         # On-demand docs loader
    search.ts       # Cross-database search
    query.ts        # Database query with filters/sorts
    read.ts         # Page reader (properties + markdown body)
    create.ts       # Page creator with markdown → blocks
    update.ts       # Page updater with batch support
  docs/
    databases.md    # Database directory, aliases, scoped search
    query.md        # Filter syntax, sort config
    search.md       # Search usage (global + database-scoped)
    read.md         # Read output format
    create.md       # Property format, content syntax
    update.md       # Update modes, batch usage
```
