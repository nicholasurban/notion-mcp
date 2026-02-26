import { describe, it, expect } from "vitest";
import { extractProperty } from "../properties.js";

describe("extractProperty", () => {
  it("title → plain text", () => {
    expect(extractProperty({ type: "title", title: [{ plain_text: "My Page" }] })).toBe("My Page");
  });

  it("rich_text → plain text, truncated at 200", () => {
    const longText = "a".repeat(250);
    expect(extractProperty({ type: "rich_text", rich_text: [{ plain_text: longText }] })).toBe("a".repeat(200) + "…");
  });

  it("rich_text → empty when no items", () => {
    expect(extractProperty({ type: "rich_text", rich_text: [] })).toBe("");
  });

  it("number → string", () => {
    expect(extractProperty({ type: "number", number: 42 })).toBe("42");
  });

  it("number null → empty", () => {
    expect(extractProperty({ type: "number", number: null })).toBe("");
  });

  it("select → name", () => {
    expect(extractProperty({ type: "select", select: { name: "Draft" } })).toBe("Draft");
  });

  it("select null → empty", () => {
    expect(extractProperty({ type: "select", select: null })).toBe("");
  });

  it("multi_select → comma-separated", () => {
    expect(extractProperty({ type: "multi_select", multi_select: [{ name: "A" }, { name: "B" }] })).toBe("A, B");
  });

  it("status → name", () => {
    expect(extractProperty({ type: "status", status: { name: "In Progress" } })).toBe("In Progress");
  });

  it("date → start", () => {
    expect(extractProperty({ type: "date", date: { start: "2026-03-01" } })).toBe("2026-03-01");
  });

  it("date with end → range", () => {
    expect(extractProperty({ type: "date", date: { start: "2026-03-01", end: "2026-03-05" } })).toBe("2026-03-01 → 2026-03-05");
  });

  it("checkbox true → Yes", () => {
    expect(extractProperty({ type: "checkbox", checkbox: true })).toBe("Yes");
  });

  it("checkbox false → No", () => {
    expect(extractProperty({ type: "checkbox", checkbox: false })).toBe("No");
  });

  it("url → string", () => {
    expect(extractProperty({ type: "url", url: "https://example.com" })).toBe("https://example.com");
  });

  it("email → string", () => {
    expect(extractProperty({ type: "email", email: "test@test.com" })).toBe("test@test.com");
  });

  it("people → comma-separated names", () => {
    expect(extractProperty({ type: "people", people: [{ name: "Alice" }, { name: "Bob" }] })).toBe("Alice, Bob");
  });

  it("formula string → value", () => {
    expect(extractProperty({ type: "formula", formula: { type: "string", string: "computed" } })).toBe("computed");
  });

  it("formula number → string", () => {
    expect(extractProperty({ type: "formula", formula: { type: "number", number: 99 } })).toBe("99");
  });

  it("formula boolean → Yes/No", () => {
    expect(extractProperty({ type: "formula", formula: { type: "boolean", boolean: true } })).toBe("Yes");
  });

  it("rollup number → string", () => {
    expect(extractProperty({ type: "rollup", rollup: { type: "number", number: 5 } })).toBe("5");
  });

  it("relation → count", () => {
    expect(extractProperty({ type: "relation", relation: [{}, {}, {}] })).toBe("3 linked");
  });

  it("unknown type → [unsupported]", () => {
    expect(extractProperty({ type: "created_by", created_by: {} })).toBe("[unsupported]");
  });

  it("null/undefined → empty", () => {
    expect(extractProperty(null)).toBe("");
    expect(extractProperty(undefined)).toBe("");
  });
});
