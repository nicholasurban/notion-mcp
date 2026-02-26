import { describe, it, expect } from "vitest";
import { loadConfig } from "../config.js";

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
