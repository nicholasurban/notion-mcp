# notion-mcp

Config-driven Notion MCP server for reading/writing pages and databases. Remote-only, token-optimized.

## Features

- Single `notion` tool with 6 modes: help, search, query, read, create, update
- Config file defines allowed databases with per-DB action permissions
- Tiered docs: ~400 token schema + on-demand help mode
- Markdown I/O for page content (3-5x smaller than block JSON)
- XPIA defense: user content wrapped in `<untrusted_content>` tags
- AI-friendly errors with suggestion fields
- Retry with exponential backoff on rate limits

## Config

Base64-encode a JSON config and set as `CONFIG_JSON` env var:

```json
{
  "databases": {
    "content-calendar": {
      "id": "abc123...",
      "description": "Blog post planning",
      "fields": ["Title", "Status", "Date"],
      "allowedActions": ["query", "read", "create", "update"]
    }
  }
}
```

- `allowedActions` defaults to all if omitted
- `fields` hints which properties to prioritize in output
- `description` helps AI choose the right database

## Environment Variables

| Variable | Required | Description |
|---|---|---|
| `NOTION_TOKEN` | Yes | Notion integration token |
| `CONFIG_JSON` | Yes | Base64-encoded config |
| `PORT` | No | HTTP port (default 3000) |
| `MCP_OAUTH_CLIENT_ID` | Yes | OAuth client ID |
| `MCP_OAUTH_CLIENT_SECRET` | Yes | OAuth client secret |
| `PUBLIC_URL` | Yes | Public URL for OAuth metadata |
| `MCP_AUTH_TOKEN` | No | Static bearer token |

## Development

```bash
npm install
npm run dev        # Watch mode
npm test           # Run tests
npm run build      # Compile TypeScript
```

## Deployment

Docker:
```bash
docker build -t notion-mcp .
docker run -p 3000:3000 \
  -e NOTION_TOKEN=ntn_xxx \
  -e CONFIG_JSON=$(base64 < config.json) \
  -e MCP_OAUTH_CLIENT_ID=xxx \
  -e MCP_OAUTH_CLIENT_SECRET=xxx \
  -e PUBLIC_URL=https://notion.mcp.outliyr.com \
  notion-mcp
```
