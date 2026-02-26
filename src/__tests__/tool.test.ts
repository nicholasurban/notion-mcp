import { describe, it, expect } from "vitest";
import { buildToolSchema, TOOL_NAME, TOOL_DESCRIPTION } from "../tool.js";

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
    expect(enumType.options).toEqual(["content-calendar", "podcast-tracker"]);
  });

  it("tool name and description are set", () => {
    expect(TOOL_NAME).toBe("notion");
    expect(TOOL_DESCRIPTION).toBeTruthy();
    expect(TOOL_DESCRIPTION.length).toBeLessThan(100);
  });
});
