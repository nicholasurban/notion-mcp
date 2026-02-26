# Notion MCP Server Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Config-driven, token-optimized Notion MCP server for reading/writing pages and databases, deployed as remote-only HTTP service.

**Architecture:** Single `notion` tool with 6 modes (help, search, query, read, create, update). Config file defines allowed databases. Tiered docs via help mode. Markdown I/O for pages. Follows kit-mcp patterns exactly (Zod schema, mode handlers, Express + OAuth, Dockerfile).

**Tech Stack:** Node.js, TypeScript, `@modelcontextprotocol/sdk`, `@notionhq/client`, Express, Zod, Axios

**Reference codebases:** `kit-mcp/` (primary pattern source), `wp-mcp/` (secondary)

---

### Task 1: Project Scaffold

**Files:**
- Create: `package.json`
- Create: `tsconfig.json`
- Create: `.gitignore`

**Step 1: Initialize project**

```bash
cd ~/Documents/Apps/mcp-servers/notion-mcp
git init
```

**Step 2: Create package.json**

```json
{
  "name": "notion-mcp-server",
  "version": "1.0.0",
  "type": "module",
  "main": "dist/index.js",
  "scripts": {
    "start": "node dist/index.js",
    "dev": "tsx watch src/index.ts",
    "build": "tsc",
    "clean": "rm -rf dist",
    "test": "vitest run",
    "test:watch": "vitest"
  },
  "engines": { "node": ">=18" }
}
```

**Step 3: Create tsconfig.json** (identical to kit-mcp)

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "Node16",
    "moduleResolution": "Node16",
    "lib": ["ES2022"],
    "outDir": "./dist",
    "rootDir": "./src",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "forceConsistentCasingInFileNames": true,
    "declaration": true,
    "sourceMap": true
  },
  "include": ["src/**/*"],
  "exclude": ["node_modules", "dist"]
}
```

**Step 4: Create .gitignore**

```
node_modules/
dist/
.env
```

**Step 5: Install dependencies**

```bash
npm install @modelcontextprotocol/sdk @notionhq/client express zod
npm install -D @types/express @types/node tsx typescript vitest
```

**Step 6: Verify build works**

```bash
mkdir -p src && echo 'console.log("ok");' > src/index.ts
npm run build
```

Run: `node dist/index.js`
Expected: prints "ok"

**Step 7: Commit**

```bash
git add package.json package-lock.json tsconfig.json .gitignore src/index.ts
git commit -m "chore: scaffold notion-mcp project"
```

---

### Task 2: Config Loader

**Files:**
- Create: `src/config.ts`
- Create: `src/__tests__/config.test.ts`

**Step 1: Write failing test**

```typescript
// src/__tests__/config.test.ts
import { describe, it, expect } from "vitest";
import { loadConfig, type NotionConfig } from "../config.js";

describe("loadConfig", () => {
  it("parses valid base64 config", () => {
    const raw = {
      databases: {
        "content-calendar": {
          id: "abc123",
          description: "Blog posts",
          fields: ["Title", "Status"],
        },
      },
    };
    const b64 = Buffer.from(JSON.stringify(raw)).toString("base64");
    const config = loadConfig(b64);
    expect(config.databases["content-calendar"].id).toBe("abc123");
    expect(config.databases["content-calendar"].allowedActions).toEqual([
      "query", "read", "create", "update",
    ]);
  });

  it("rejects config with no databases", () => {
    const b64 = Buffer.from(JSON.stringify({ databases: {} })).toString("base64");
    expect(() => loadConfig(b64)).toThrow("at least one database");
  });

  it("rejects database missing id", () => {
    const raw = { databases: { test: { description: "x" } } };
    const b64 = Buffer.from(JSON.stringify(raw)).toString("base64");
    expect(() => loadConfig(b64)).toThrow();
  });

  it("returns database names list", () => {
    const raw = {
      databases: {
        "db-a": { id: "1", description: "A" },
        "db-b": { id: "2", description: "B" },
      },
    };
    const b64 = Buffer.from(JSON.stringify(raw)).toString("base64");
    const config = loadConfig(b64);
    expect(config.databaseNames).toEqual(["db-a", "db-b"]);
  });
});
```

**Step 2: Run test to verify it fails**

Run: `npx vitest run src/__tests__/config.test.ts`
Expected: FAIL — module not found

**Step 3: Implement config loader**

```typescript
// src/config.ts
import { z } from "zod";

const ALL_ACTIONS = ["query", "read", "create", "update"] as const;

const DatabaseSchema = z.object({
  id: z.string().min(1),
  description: z.string().default(""),
  fields: z.array(z.string()).default([]),
  allowedActions: z.array(z.enum(ALL_ACTIONS)).default([...ALL_ACTIONS]),
});

const ConfigSchema = z.object({
  databases: z.record(z.string(), DatabaseSchema),
});

export type DatabaseConfig = z.infer<typeof DatabaseSchema>;
export type NotionConfig = z.infer<typeof ConfigSchema> & {
  databaseNames: string[];
};

export function loadConfig(base64: string): NotionConfig {
  const json = JSON.parse(Buffer.from(base64, "base64").toString("utf-8"));
  const parsed = ConfigSchema.parse(json);

  if (Object.keys(parsed.databases).length === 0) {
    throw new Error("Config must define at least one database");
  }

  return {
    ...parsed,
    databaseNames: Object.keys(parsed.databases),
  };
}
```

**Step 4: Run test to verify it passes**

Run: `npx vitest run src/__tests__/config.test.ts`
Expected: all 4 tests PASS

**Step 5: Commit**

```bash
git add src/config.ts src/__tests__/config.test.ts
git commit -m "feat: config loader with Zod validation"
```

---

### Task 3: Notion API Client

**Files:**
- Create: `src/api.ts`
- Create: `src/__tests__/api.test.ts`

**Step 1: Write failing test**

```typescript
// src/__tests__/api.test.ts
import { describe, it, expect, vi } from "vitest";
import { NotionAPI } from "../api.js";

describe("NotionAPI", () => {
  it("constructs with token", () => {
    const api = new NotionAPI("ntn_test");
    expect(api).toBeDefined();
  });

  it("resolveDatabase maps friendly name to ID", () => {
    const databases = {
      "content-calendar": { id: "abc123", description: "", fields: [], allowedActions: ["query" as const, "read" as const, "create" as const, "update" as const] },
    };
    const api = new NotionAPI("ntn_test");
    expect(api.resolveDatabase("content-calendar", databases)).toBe("abc123");
  });

  it("resolveDatabase throws for unknown name", () => {
    const api = new NotionAPI("ntn_test");
    expect(() => api.resolveDatabase("unknown", {})).toThrow();
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
    const result = await api.retryWithBackoff(fn);
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
    await expect(api.retryWithBackoff(fn)).rejects.toThrow();
  });
});
```

**Step 2: Run test to verify it fails**

Run: `npx vitest run src/__tests__/api.test.ts`
Expected: FAIL

**Step 3: Implement API client**

```typescript
// src/api.ts
import { Client } from "@notionhq/client";
import type { DatabaseConfig } from "./config.js";

export class NotionAPI {
  public client: Client;
  private schemaCache: Map<string, Record<string, string>> = new Map();

  constructor(token: string) {
    this.client = new Client({ auth: token });
  }

  resolveDatabase(
    name: string,
    databases: Record<string, DatabaseConfig>
  ): string {
    const db = databases[name];
    if (!db) {
      const available = Object.keys(databases).join(", ");
      throw new AIError(
        `Database '${name}' not found`,
        `Available: ${available}`
      );
    }
    return db.id;
  }

  async retryWithBackoff<T>(
    fn: () => Promise<T>,
    maxAttempts = 3,
    baseDelay = 1000
  ): Promise<T> {
    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      try {
        return await fn();
      } catch (err: any) {
        if (err.status === 429 && attempt < maxAttempts) {
          await new Promise((r) => setTimeout(r, baseDelay * Math.pow(2, attempt - 1)));
          continue;
        }
        throw err;
      }
    }
    throw new Error("unreachable");
  }

  async getSchema(databaseId: string): Promise<Record<string, string>> {
    const cached = this.schemaCache.get(databaseId);
    if (cached) return cached;

    const db = await this.retryWithBackoff(() =>
      this.client.databases.retrieve({ database_id: databaseId })
    );
    const schema: Record<string, string> = {};
    if ("properties" in db) {
      for (const [name, prop] of Object.entries(db.properties)) {
        schema[name] = prop.type;
      }
    }
    this.schemaCache.set(databaseId, schema);
    return schema;
  }

  async paginateAll<T>(
    fetcher: (cursor?: string) => Promise<{ results: T[]; next_cursor: string | null; has_more: boolean }>,
    limit: number
  ): Promise<T[]> {
    const all: T[] = [];
    let cursor: string | undefined;
    while (all.length < limit) {
      const page = await this.retryWithBackoff(() => fetcher(cursor));
      all.push(...page.results);
      if (!page.has_more || !page.next_cursor) break;
      cursor = page.next_cursor;
    }
    return all.slice(0, limit);
  }
}

export class AIError extends Error {
  suggestion: string;
  constructor(message: string, suggestion: string) {
    super(message);
    this.name = "AIError";
    this.suggestion = suggestion;
  }
}
```

**Step 4: Run test to verify it passes**

Run: `npx vitest run src/__tests__/api.test.ts`
Expected: all 5 tests PASS

**Step 5: Commit**

```bash
git add src/api.ts src/__tests__/api.test.ts
git commit -m "feat: Notion API client with retry and schema cache"
```

---

### Task 4: Markdown Converter

**Files:**
- Create: `src/markdown.ts`
- Create: `src/__tests__/markdown.test.ts`

This is the most complex module. Handles bidirectional Notion blocks ↔ markdown conversion.

**Step 1: Write failing tests for blocks → markdown**

```typescript
// src/__tests__/markdown.test.ts
import { describe, it, expect } from "vitest";
import { blocksToMarkdown, markdownToBlocks } from "../markdown.js";

describe("blocksToMarkdown", () => {
  it("converts heading_1", () => {
    const blocks = [{ type: "heading_1", heading_1: { rich_text: [{ plain_text: "Title" }] } }];
    expect(blocksToMarkdown(blocks)).toBe("# Title");
  });

  it("converts paragraph", () => {
    const blocks = [{ type: "paragraph", paragraph: { rich_text: [{ plain_text: "Hello world" }] } }];
    expect(blocksToMarkdown(blocks)).toBe("Hello world");
  });

  it("converts bulleted_list_item", () => {
    const blocks = [{ type: "bulleted_list_item", bulleted_list_item: { rich_text: [{ plain_text: "Item" }] } }];
    expect(blocksToMarkdown(blocks)).toBe("- Item");
  });

  it("converts code block", () => {
    const blocks = [{
      type: "code",
      code: { rich_text: [{ plain_text: "const x = 1;" }], language: "typescript" },
    }];
    expect(blocksToMarkdown(blocks)).toBe("```typescript\nconst x = 1;\n```");
  });

  it("wraps output in untrusted_content tags", () => {
    const blocks = [{ type: "paragraph", paragraph: { rich_text: [{ plain_text: "test" }] } }];
    const result = blocksToMarkdown(blocks, { wrapUntrusted: true });
    expect(result).toContain("<untrusted_content>");
    expect(result).toContain("</untrusted_content>");
  });

  it("renders unsupported types as placeholder", () => {
    const blocks = [{ type: "synced_block", synced_block: {} }];
    expect(blocksToMarkdown(blocks)).toBe("[unsupported: synced_block]");
  });
});

describe("markdownToBlocks", () => {
  it("converts heading", () => {
    const blocks = markdownToBlocks("# Title");
    expect(blocks[0].type).toBe("heading_1");
  });

  it("converts paragraph", () => {
    const blocks = markdownToBlocks("Hello world");
    expect(blocks[0].type).toBe("paragraph");
  });

  it("converts bullet list", () => {
    const blocks = markdownToBlocks("- Item 1\n- Item 2");
    expect(blocks).toHaveLength(2);
    expect(blocks[0].type).toBe("bulleted_list_item");
  });

  it("converts code block", () => {
    const blocks = markdownToBlocks("```js\nconst x = 1;\n```");
    expect(blocks[0].type).toBe("code");
  });
});
```

**Step 2: Run test to verify it fails**

Run: `npx vitest run src/__tests__/markdown.test.ts`
Expected: FAIL

**Step 3: Implement markdown converter**

Create `src/markdown.ts`. Key implementation notes:
- `blocksToMarkdown`: Switch on block type, extract `rich_text[].plain_text`, concatenate with format markers. Handle: heading_1/2/3, paragraph, bulleted_list_item, numbered_list_item, to_do, code, quote, callout, divider, image, toggle, table. Unsupported → `[unsupported: {type}]`.
- `markdownToBlocks`: Simple line-by-line parser. Split on `\n`, detect patterns (`^# ` → heading_1, `^- ` → bulleted, `` ^``` `` → code fence, etc.). Build Notion block objects with `rich_text` arrays.
- `richTextToPlain`: Extract and join `.plain_text` from rich_text array. Handle bold (`**`), italic (`*`), code (`` ` ``), links (`[text](url)`).
- `wrapUntrusted` option: wraps full output in `<untrusted_content>` tags.

The implementation should be ~150-200 lines. Reference Notion's block type docs: each block type has a property named after its type containing `rich_text` array.

**Step 4: Run test to verify it passes**

Run: `npx vitest run src/__tests__/markdown.test.ts`
Expected: all tests PASS

**Step 5: Commit**

```bash
git add src/markdown.ts src/__tests__/markdown.test.ts
git commit -m "feat: bidirectional markdown ↔ Notion blocks converter"
```

---

### Task 5: Tool Schema & Mode Dispatch

**Files:**
- Create: `src/tool.ts`
- Create: `src/__tests__/tool.test.ts`

**Step 1: Write failing test**

```typescript
// src/__tests__/tool.test.ts
import { describe, it, expect } from "vitest";
import { TOOL_SCHEMA, buildToolSchema } from "../tool.js";

describe("tool schema", () => {
  it("has mode enum with all 6 modes", () => {
    const schema = buildToolSchema(["db-a", "db-b"]);
    const modeEnum = schema.mode;
    expect(modeEnum.options).toEqual(["help", "search", "query", "read", "create", "update"]);
  });

  it("injects database names into database enum", () => {
    const schema = buildToolSchema(["content-calendar", "podcast-tracker"]);
    const dbEnum = schema.database;
    expect(dbEnum.unwrap().unwrap().options).toEqual(["content-calendar", "podcast-tracker"]);
  });
});
```

**Step 2: Run test to verify it fails**

Run: `npx vitest run src/__tests__/tool.test.ts`
Expected: FAIL

**Step 3: Implement tool schema**

```typescript
// src/tool.ts
import { z } from "zod";
import type { NotionAPI } from "./api.js";
import type { NotionConfig } from "./config.js";

export const TOOL_NAME = "notion";
export const TOOL_DESCRIPTION = "Read/write Notion pages and databases. Use help mode first for syntax.";

export function buildToolSchema(databaseNames: string[]) {
  return {
    mode: z.enum(["help", "search", "query", "read", "create", "update"])
      .describe("Operation mode"),
    database: z.enum(databaseNames as [string, ...string[]])
      .optional().describe("Database name"),
    page_id: z.string().optional().describe("Page UUID"),
    query: z.string().optional().describe("Search or filter text"),
    sort: z.string().optional().describe("Sort config as JSON"),
    properties: z.record(z.string(), z.unknown()).optional()
      .describe("Key-value properties"),
    content: z.string().optional().describe("Markdown body"),
    topic: z.string().optional().describe("Help topic name"),
    limit: z.number().int().min(1).max(200).default(50).optional()
      .describe("Max results"),
  };
}

export type ToolParams = {
  mode: string;
  database?: string;
  page_id?: string;
  query?: string;
  sort?: string;
  properties?: Record<string, unknown>;
  content?: string;
  topic?: string;
  limit?: number;
};

export interface ToolContext {
  api: NotionAPI;
  config: NotionConfig;
}

export async function toolHandler(ctx: ToolContext, params: ToolParams): Promise<string> {
  try {
    switch (params.mode) {
      case "help":
        return await handleHelp(params);
      case "search":
        return await handleSearch(ctx, params);
      case "query":
        return await handleQuery(ctx, params);
      case "read":
        return await handleRead(ctx, params);
      case "create":
        return await handleCreate(ctx, params);
      case "update":
        return await handleUpdate(ctx, params);
      default:
        return JSON.stringify({ error: `Unknown mode: ${params.mode}` });
    }
  } catch (err: any) {
    if (err.name === "AIError") {
      return JSON.stringify({ error: err.message, suggestion: err.suggestion });
    }
    return JSON.stringify({ error: err.message ?? "Unknown error" });
  }
}
```

Import the mode handlers (implemented in subsequent tasks). For now, each handler can be a stub returning `JSON.stringify({ error: "not implemented" })`.

**Step 4: Run test to verify it passes**

Run: `npx vitest run src/__tests__/tool.test.ts`
Expected: PASS

**Step 5: Commit**

```bash
git add src/tool.ts src/__tests__/tool.test.ts
git commit -m "feat: tool schema with dynamic database enum and mode dispatch"
```

---

### Task 6: Help Mode Handler

**Files:**
- Create: `src/modes/help.ts`
- Create: `src/docs/query.md`
- Create: `src/docs/search.md`
- Create: `src/docs/read.md`
- Create: `src/docs/create.md`
- Create: `src/docs/update.md`
- Create: `src/__tests__/help.test.ts`

**Step 1: Write failing test**

```typescript
// src/__tests__/help.test.ts
import { describe, it, expect } from "vitest";
import { handleHelp } from "../modes/help.js";

describe("handleHelp", () => {
  it("returns docs for valid topic", async () => {
    const result = await handleHelp({ mode: "help", topic: "query" });
    const parsed = JSON.parse(result);
    expect(parsed.topic).toBe("query");
    expect(parsed.docs).toContain("filter");
  });

  it("rejects invalid topic (path traversal)", async () => {
    const result = await handleHelp({ mode: "help", topic: "../../../etc/passwd" });
    const parsed = JSON.parse(result);
    expect(parsed.error).toBeDefined();
  });

  it("lists available topics when no topic given", async () => {
    const result = await handleHelp({ mode: "help" });
    const parsed = JSON.parse(result);
    expect(parsed.topics).toContain("query");
  });
});
```

**Step 2: Run test to verify it fails**

Run: `npx vitest run src/__tests__/help.test.ts`
Expected: FAIL

**Step 3: Implement help handler**

```typescript
// src/modes/help.ts
import { readFileSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";
import type { ToolParams } from "../tool.js";

const VALID_TOPICS = ["query", "search", "read", "create", "update"];
const __dirname = dirname(fileURLToPath(import.meta.url));
const DOCS_DIR = join(__dirname, "..", "docs");

export async function handleHelp(params: ToolParams): Promise<string> {
  const topic = params.topic;

  if (!topic) {
    return JSON.stringify({ topics: VALID_TOPICS, hint: "Call with topic param for detailed docs" });
  }

  if (!VALID_TOPICS.includes(topic)) {
    return JSON.stringify({
      error: `Invalid topic: ${topic}`,
      suggestion: `Valid topics: ${VALID_TOPICS.join(", ")}`,
    });
  }

  try {
    const content = readFileSync(join(DOCS_DIR, `${topic}.md`), "utf-8");
    return JSON.stringify({ topic, docs: content });
  } catch {
    return JSON.stringify({ error: `Docs not found for ${topic}` });
  }
}
```

**Step 4: Write the docs files**

Create concise `.md` files in `src/docs/` (~300-500 tokens each). Each doc covers: parameter requirements, filter/sort syntax, examples, common errors. Keep them lean — these are the tier-2 docs that load on demand.

Example `src/docs/query.md`:
```markdown
# Query Mode

Query a configured database with filters and sorts.

## Required
- `database`: friendly name from config
- `query`: JSON filter object (Notion filter format)

## Filter syntax
```json
{"property": "Status", "status": {"equals": "Published"}}
```

Compound: `{"and": [filter1, filter2]}` or `{"or": [...]}`

## Sort syntax
`sort` param as JSON: `{"property": "Created", "direction": "descending"}`

## Response
Pipe-delimited table with config `fields` columns. Includes `total` and `returned` counts.

## Common errors
- Wrong database name → check `help` with no topic for list
- Invalid filter property → call `read` on a page from that DB to see available properties
```

**Step 5: Run test to verify it passes**

Run: `npx vitest run src/__tests__/help.test.ts`
Expected: PASS

Note: docs files need to be copied to `dist/docs/` during build. Add a postbuild script or copy step. Update `package.json`:
```json
"build": "tsc && cp -r src/docs dist/docs"
```

**Step 6: Commit**

```bash
git add src/modes/help.ts src/docs/ src/__tests__/help.test.ts package.json
git commit -m "feat: help mode with tiered on-demand docs"
```

---

### Task 7: Search Mode Handler

**Files:**
- Create: `src/modes/search.ts`
- Create: `src/__tests__/search.test.ts`

**Step 1: Write failing test** (mock Notion client)

Test that search:
- Calls `notion.search()` with query text
- Filters results to only configured database pages
- Formats as compact table
- Respects limit param

**Step 2: Run test to verify it fails**

**Step 3: Implement search handler**

Key logic:
- Call `api.client.search({ query: params.query })` with auto-pagination
- Filter results: only include pages whose `parent.database_id` matches a configured database
- Format: pipe-delimited table with page title, database name, last edited
- Wrap content in `<untrusted_content>` tags

**Step 4: Run test, verify pass**

**Step 5: Commit**

```bash
git commit -m "feat: search mode spanning configured databases"
```

---

### Task 8: Query Mode Handler

**Files:**
- Create: `src/modes/query.ts`
- Create: `src/__tests__/query.test.ts`

**Step 1: Write failing test**

Test that query:
- Validates `database` param is required
- Checks `allowedActions` includes "query"
- Resolves friendly name → database ID
- Passes filter/sort to Notion API
- Returns compact pipe-delimited table
- Prioritizes config `fields` in output columns
- Handles empty results

**Step 2: Run test to verify it fails**

**Step 3: Implement query handler**

Key logic:
- Resolve database name → ID via `api.resolveDatabase()`
- Check `allowedActions` includes "query"
- Parse `params.query` as JSON filter (if provided)
- Parse `params.sort` as JSON sort (if provided)
- Call `api.client.databases.query()` with auto-pagination via `api.paginateAll()`
- Extract properties → plain text values using property extractors
- Format: header row from config `fields` (or all properties), pipe-delimited data rows
- Include `total: N | returned: N` footer
- Truncate long values to 200 chars

**Step 4: Run test, verify pass**

**Step 5: Commit**

```bash
git commit -m "feat: query mode with config-driven database access"
```

---

### Task 9: Property Extractors

**Files:**
- Create: `src/properties.ts`
- Create: `src/__tests__/properties.test.ts`

**Step 1: Write failing tests**

Test extraction for each Notion property type → plain text:
- `title` → string
- `rich_text` → string (truncated)
- `number` → string
- `select` → name
- `multi_select` → comma-separated names
- `status` → name
- `date` → start date string
- `checkbox` → "Yes"/"No"
- `url` → string
- `email` → string
- `people` → comma-separated names
- `formula` → resolved value
- `rollup` → resolved value
- `relation` → count or IDs
- Unknown type → "[unsupported]"

**Step 2: Run test to verify it fails**

**Step 3: Implement extractors**

```typescript
// src/properties.ts
export function extractProperty(prop: any): string {
  if (!prop) return "";
  switch (prop.type) {
    case "title":
      return prop.title?.map((t: any) => t.plain_text).join("") ?? "";
    case "rich_text":
      return truncate(prop.rich_text?.map((t: any) => t.plain_text).join("") ?? "", 200);
    case "select":
      return prop.select?.name ?? "";
    case "multi_select":
      return prop.multi_select?.map((s: any) => s.name).join(", ") ?? "";
    case "status":
      return prop.status?.name ?? "";
    case "date":
      return prop.date?.start ?? "";
    case "number":
      return prop.number?.toString() ?? "";
    case "checkbox":
      return prop.checkbox ? "Yes" : "No";
    case "url":
      return prop.url ?? "";
    case "email":
      return prop.email ?? "";
    case "people":
      return prop.people?.map((p: any) => p.name).join(", ") ?? "";
    case "formula":
      return extractFormula(prop.formula);
    case "rollup":
      return extractRollup(prop.rollup);
    case "relation":
      return `${prop.relation?.length ?? 0} linked`;
    default:
      return "[unsupported]";
  }
}

function truncate(s: string, max: number): string {
  return s.length > max ? s.slice(0, max) + "…" : s;
}
```

**Step 4: Run test, verify pass**

**Step 5: Commit**

```bash
git commit -m "feat: property type extractors for all Notion types"
```

---

### Task 10: Read Mode Handler

**Files:**
- Create: `src/modes/read.ts`
- Create: `src/__tests__/read.test.ts`

**Step 1: Write failing test**

Test that read:
- Validates `page_id` is required and UUID format
- Fetches page properties + child blocks
- Returns properties as key-value header + markdown body
- Wraps content in `<untrusted_content>` tags
- Handles empty pages

**Step 2: Run test to verify it fails**

**Step 3: Implement read handler**

Key logic:
- Validate `page_id` as UUID
- Call `api.client.pages.retrieve({ page_id })` for properties
- Call `api.client.blocks.children.list({ block_id: page_id })` for content (auto-paginate)
- Extract properties → plain text using property extractors, omit empty
- Convert blocks → markdown using `blocksToMarkdown(blocks, { wrapUntrusted: true })`
- Return: `{ properties: { ... }, content: "<untrusted_content>markdown</untrusted_content>" }`

**Step 4: Run test, verify pass**

**Step 5: Commit**

```bash
git commit -m "feat: read mode with markdown output and XPIA defense"
```

---

### Task 11: Create Mode Handler

**Files:**
- Create: `src/modes/create.ts`
- Create: `src/__tests__/create.test.ts`

**Step 1: Write failing test**

Test that create:
- Validates `database` is required
- Checks `allowedActions` includes "create"
- Validates content size (< 100KB)
- Builds page properties from `params.properties`
- Converts markdown content to blocks
- Returns created page ID and URL

**Step 2: Run test to verify it fails**

**Step 3: Implement create handler**

Key logic:
- Resolve database → ID, check allowedActions
- Get database schema via `api.getSchema()`
- Build `properties` object matching Notion API format (type-aware: title, rich_text, select, etc.)
- If `params.content`, convert markdown → blocks via `markdownToBlocks()`
- Call `api.client.pages.create({ parent: { database_id }, properties, children: blocks })`
- Return `{ created: true, page_id, url }`

**Step 4: Run test, verify pass**

**Step 5: Commit**

```bash
git commit -m "feat: create mode with markdown input and schema validation"
```

---

### Task 12: Update Mode Handler

**Files:**
- Create: `src/modes/update.ts`
- Create: `src/__tests__/update.test.ts`

**Step 1: Write failing test**

Test that update:
- Validates `page_id` required (single or array for batch)
- Checks `allowedActions` includes "update"
- Updates properties when provided
- Replaces page content when `content` provided
- Handles batch updates (array of page_ids)
- Validates content size

**Step 2: Run test to verify it fails**

**Step 3: Implement update handler**

Key logic:
- Accept `page_id` as string or `page_ids` as array in properties
- For properties update: resolve types from schema, call `api.client.pages.update()`
- For content update: archive existing blocks, append new blocks from `markdownToBlocks()`
- Batch: iterate page_ids, collect results, return summary
- Return `{ updated: true, page_id }` or `{ updated: N, results: [...] }` for batch

**Step 4: Run test, verify pass**

**Step 5: Commit**

```bash
git commit -m "feat: update mode with batch support and markdown content"
```

---

### Task 13: Response Formatter

**Files:**
- Create: `src/format.ts`
- Create: `src/__tests__/format.test.ts`

**Step 1: Write failing test**

```typescript
describe("formatTable", () => {
  it("formats results as pipe-delimited table", () => {
    const rows = [
      { Title: "Post 1", Status: "Draft" },
      { Title: "Post 2", Status: "Published" },
    ];
    const result = formatTable(rows, ["Title", "Status"]);
    expect(result).toBe("Title | Status\nPost 1 | Draft\nPost 2 | Published");
  });

  it("omits empty columns", () => { ... });
  it("truncates long values", () => { ... });
  it("adds count footer", () => { ... });
});
```

**Step 2: Run test to verify it fails**

**Step 3: Implement formatter**

Pipe-delimited table generator. Takes rows + column list, returns compact string with count footer.

**Step 4: Run test, verify pass**

**Step 5: Commit**

```bash
git commit -m "feat: compact pipe-delimited response formatter"
```

---

### Task 14: HTTP Server & OAuth

**Files:**
- Create: `src/index.ts` (replace placeholder)
- Create: `src/oauth.ts` (copy from kit-mcp, adapt)

**Step 1: Write the server entry point**

Follow kit-mcp's `index.ts` pattern exactly but HTTP-only (no stdio branch):

```typescript
// src/index.ts
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import express from "express";
import { loadConfig } from "./config.js";
import { NotionAPI } from "./api.js";
import { TOOL_NAME, TOOL_DESCRIPTION, buildToolSchema, toolHandler } from "./tool.js";
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

const server = new McpServer({ name: "notion-mcp", version: "1.0.0" });
const schema = buildToolSchema(config.databaseNames);

server.tool(TOOL_NAME, TOOL_DESCRIPTION, schema, async (params) => {
  const result = await toolHandler(ctx, params as any);
  return { content: [{ type: "text" as const, text: result }] };
});

const app = express();
app.use(express.json());

const { validateToken } = setupOAuth(app, {
  clientId: process.env.MCP_OAUTH_CLIENT_ID!,
  clientSecret: process.env.MCP_OAUTH_CLIENT_SECRET!,
  publicUrl: process.env.PUBLIC_URL!,
  staticToken: process.env.MCP_AUTH_TOKEN,
});

app.post("/mcp", async (req, res) => {
  if (!validateToken(req)) { res.status(401).json({ error: "Unauthorized" }); return; }
  const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined, enableJsonResponse: true });
  res.on("close", () => transport.close());
  await server.connect(transport);
  await transport.handleRequest(req, res, req.body);
});

app.get("/health", async (_req, res) => {
  res.json({
    status: "ok",
    databases: config.databaseNames.length,
    notion: await api.client.users.me({}).then(() => "connected").catch(() => "error"),
  });
});

app.listen(PORT, () => console.error(`Notion MCP running on http://0.0.0.0:${PORT}/mcp`));
```

**Step 2: Copy and adapt oauth.ts from kit-mcp**

```bash
cp ../kit-mcp/src/oauth.ts src/oauth.ts
```

No changes needed — it's generic OAuth2 + PKCE + static token. Same pattern across all your MCPs.

**Step 3: Verify build compiles**

```bash
npm run build
```

Expected: compiles without errors

**Step 4: Commit**

```bash
git add src/index.ts src/oauth.ts
git commit -m "feat: HTTP server with OAuth and health endpoint"
```

---

### Task 15: Dockerfile & Deploy Config

**Files:**
- Create: `Dockerfile`
- Create: `README.md`

**Step 1: Create Dockerfile** (same pattern as kit-mcp)

```dockerfile
FROM node:22-slim AS builder
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY tsconfig.json ./
COPY src/ ./src/
RUN npm run build

FROM node:22-slim
RUN apt-get update && apt-get install -y --no-install-recommends curl && rm -rf /var/lib/apt/lists/*
WORKDIR /app
COPY package*.json ./
RUN npm ci --omit=dev
COPY --from=builder /app/dist ./dist
ENV PORT=3000
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s --retries=3 \
  CMD curl -f http://localhost:3000/health || exit 1
CMD ["node", "dist/index.js"]
```

**Step 2: Create README.md**

Document: what it does, env vars needed, config format, how to add databases, how to deploy.

**Step 3: Verify Docker build**

```bash
docker build -t notion-mcp .
```

Expected: builds successfully

**Step 4: Commit**

```bash
git add Dockerfile README.md
git commit -m "feat: Dockerfile and README for deployment"
```

---

### Task 16: Integration Test & Deploy

**Step 1: Create GitHub repo**

```bash
gh repo create nicholasurban/notion-mcp --public --source=. --push
```

**Step 2: Create test config with a real database**

User provides a Notion database ID to test with. Create config, base64 encode, set as env var.

**Step 3: Run locally with real Notion token**

```bash
NOTION_TOKEN=ntn_xxx CONFIG_JSON=$(base64 < config.json) PORT=3000 \
  MCP_AUTH_TOKEN=test npm start
```

Test with curl:
```bash
# Health check
curl http://localhost:3000/health

# Help mode
curl -X POST http://localhost:3000/mcp \
  -H "Authorization: Bearer test" \
  -H "Content-Type: application/json" \
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/call","params":{"name":"notion","arguments":{"mode":"help"}}}'
```

**Step 4: Deploy to Coolify**

- Create new service in Coolify from GitHub repo
- Set env vars: `NOTION_TOKEN`, `CONFIG_JSON`, `MCP_OAUTH_CLIENT_ID`, `MCP_OAUTH_CLIENT_SECRET`, `PUBLIC_URL=https://notion.mcp.outliyr.com`, `MCP_AUTH_TOKEN`
- Set domain: `notion.mcp.outliyr.com`
- Deploy

**Step 5: Add DNS**

```bash
# A record: notion.mcp.outliyr.com → 46.224.152.172 (DNS-only)
```

**Step 6: Register in Claude Code**

```bash
claude mcp add-json notion-remote '{"type":"http","url":"https://notion.mcp.outliyr.com/mcp","headers":{"Authorization":"Bearer <token>"}}' --scope user
```

**Step 7: Verify end-to-end**

In Claude Code, test:
- `notion help` → returns topic list
- `notion search "test"` → returns results
- `notion query database="content-calendar"` → returns table
- `notion read page_id="..."` → returns markdown

**Step 8: Commit any fixes and push**

```bash
git push origin main
```

---

## Task Dependency Graph

```
1 (scaffold) → 2 (config) → 3 (api) → 4 (markdown) → 9 (properties)
                                ↓
                          5 (tool schema)
                                ↓
                    ┌───────────┼───────────┐
                    ↓           ↓           ↓
              6 (help)    7 (search)   13 (format)
                          8 (query)        ↓
                         10 (read)    all mode handlers
                         11 (create)
                         12 (update)
                                ↓
                          14 (server)
                                ↓
                          15 (docker)
                                ↓
                          16 (deploy)
```

Tasks 6-13 can be parallelized after task 5 is complete.
