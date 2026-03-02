import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import express from "express";
import { loadConfig } from "./config.js";
import { NotionAPI } from "./api.js";
import { TOOL_NAME, buildToolDescription, buildToolSchema, toolHandler } from "./tool.js";
import { setupOAuth } from "./oauth.js";
import type { ToolContext } from "./tool.js";

const PORT = parseInt(process.env.PORT ?? "3000", 10);
const notionToken = process.env.NOTION_TOKEN;
const configB64 = process.env.CONFIG_JSON;

if (!notionToken) { console.error("NOTION_TOKEN required"); process.exit(1); }
if (!configB64) { console.error("CONFIG_JSON required"); process.exit(1); }

const config = loadConfig(configB64);
const api = new NotionAPI(notionToken);
const ctx: ToolContext = { api, config };

console.error(`Loaded ${config.databaseNames.length} databases: ${config.databaseNames.join(", ")}`);

const server = new McpServer({ name: "notion-mcp", version: "1.0.0" });
const schema = buildToolSchema(config.databaseNames, Object.keys(config.aliasMap));
const toolDescription = buildToolDescription(config.databases);

server.tool(TOOL_NAME, toolDescription, schema, async (params) => {
  const result = await toolHandler(ctx, params as any);
  return { content: [{ type: "text" as const, text: result }] };
});

const app = express();
app.use(express.json());
app.use(express.urlencoded({ extended: false }));

const oauthClientId = process.env.MCP_OAUTH_CLIENT_ID;
const oauthClientSecret = process.env.MCP_OAUTH_CLIENT_SECRET;
const publicUrl = process.env.PUBLIC_URL;

if (!oauthClientId || !oauthClientSecret || !publicUrl) {
  console.error("MCP_OAUTH_CLIENT_ID, MCP_OAUTH_CLIENT_SECRET, PUBLIC_URL required");
  process.exit(1);
}

const { validateToken } = setupOAuth(app, {
  clientId: oauthClientId,
  clientSecret: oauthClientSecret,
  publicUrl,
  staticToken: process.env.MCP_AUTH_TOKEN,
});

app.post("/mcp", async (req, res) => {
  if (!validateToken(req)) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }
  const transport = new StreamableHTTPServerTransport({
    sessionIdGenerator: undefined,
    enableJsonResponse: true,
  });
  res.on("close", () => transport.close());
  await server.connect(transport);
  await transport.handleRequest(req, res, req.body);
});

app.get("/health", async (_req, res) => {
  let notionStatus = "unknown";
  try {
    await api.client.users.me({});
    notionStatus = "connected";
  } catch {
    notionStatus = "error";
  }
  res.json({
    status: "ok",
    databases: config.databaseNames.length,
    databaseNames: config.databaseNames,
    notion: notionStatus,
  });
});

app.listen(PORT, () => {
  console.error(`Notion MCP running on http://0.0.0.0:${PORT}/mcp`);
});
