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

  it("builds alias map from database aliases", () => {
    const raw = {
      databases: {
        "products-shop": {
          id: "abc123",
          description: "Products",
          aliases: ["shop", "products", "store"],
        },
        "affiliate-details": {
          id: "def456",
          description: "Affiliates",
          aliases: ["affiliates", "partners"],
        },
      },
    };
    const b64 = Buffer.from(JSON.stringify(raw)).toString("base64");
    const config = loadConfig(b64);
    expect(config.aliasMap["shop"]).toBe("products-shop");
    expect(config.aliasMap["products"]).toBe("products-shop");
    expect(config.aliasMap["store"]).toBe("products-shop");
    expect(config.aliasMap["affiliates"]).toBe("affiliate-details");
    expect(config.aliasMap["partners"]).toBe("affiliate-details");
  });

  it("alias map is case-insensitive", () => {
    const raw = {
      databases: {
        "products-shop": {
          id: "abc123",
          aliases: ["Shop", "PRODUCTS"],
        },
      },
    };
    const b64 = Buffer.from(JSON.stringify(raw)).toString("base64");
    const config = loadConfig(b64);
    expect(config.aliasMap["shop"]).toBe("products-shop");
    expect(config.aliasMap["products"]).toBe("products-shop");
  });

  it("parses searchFields when provided", () => {
    const raw = {
      databases: {
        "products-shop": {
          id: "abc123",
          searchFields: ["Name", "Brand", "Slug"],
        },
      },
    };
    const b64 = Buffer.from(JSON.stringify(raw)).toString("base64");
    const config = loadConfig(b64);
    expect(config.databases["products-shop"].searchFields).toEqual(["Name", "Brand", "Slug"]);
  });

  it("searchFields is undefined when not provided", () => {
    const raw = {
      databases: {
        "db-a": { id: "1", description: "A" },
      },
    };
    const b64 = Buffer.from(JSON.stringify(raw)).toString("base64");
    const config = loadConfig(b64);
    expect(config.databases["db-a"].searchFields).toBeUndefined();
  });
});
