import { describe, it, expect } from "vitest";
import { buildToolSchema, buildToolDescription, TOOL_NAME } from "../tool.js";

describe("buildToolSchema", () => {
  it("has all 6 modes", () => {
    const schema = buildToolSchema(["db-a"]);
    const parsed = schema.mode.options;
    expect(parsed).toEqual(["help", "search", "query", "read", "create", "update"]);
  });

  it("injects database names into database enum", () => {
    const schema = buildToolSchema(["content-calendar", "podcast-tracker"]);
    const inner = schema.database;
    const enumType = inner._def.innerType;
    expect(enumType.options).toContain("content-calendar");
    expect(enumType.options).toContain("podcast-tracker");
  });

  it("includes alias names in database enum", () => {
    const schema = buildToolSchema(["products-shop"], ["shop", "products"]);
    const inner = schema.database;
    const enumType = inner._def.innerType;
    expect(enumType.options).toContain("products-shop");
    expect(enumType.options).toContain("shop");
    expect(enumType.options).toContain("products");
  });

  it("allows limit up to 500", () => {
    const schema = buildToolSchema(["test-db"]);
    const result = schema.limit.safeParse(500);
    expect(result.success).toBe(true);
  });

  it("rejects limit above 500", () => {
    const schema = buildToolSchema(["test-db"]);
    const result = schema.limit.safeParse(501);
    expect(result.success).toBe(false);
  });

  it("schema accepts clear_fields parameter", () => {
    const schema = buildToolSchema(["test-db"], []);
    expect(schema.clear_fields).toBeDefined();
  });

  it("tool name is set", () => {
    expect(TOOL_NAME).toBe("notion");
  });
});

describe("buildToolDescription", () => {
  it("includes database names and descriptions", () => {
    const desc = buildToolDescription({
      "products-shop": {
        id: "abc",
        description: "Shop catalog",
        fields: [],
        allowedActions: ["query", "read", "create", "update"],
        aliases: [],
      },
      "affiliate-details": {
        id: "def",
        description: "Affiliate codes",
        fields: [],
        allowedActions: ["query", "read", "create", "update"],
        aliases: [],
      },
    });
    expect(desc).toContain("products-shop: Shop catalog");
    expect(desc).toContain("affiliate-details: Affiliate codes");
    expect(desc).toContain("Databases:");
    expect(desc).toContain("help mode");
  });
});
