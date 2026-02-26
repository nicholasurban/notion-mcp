import { describe, it, expect } from "vitest";
import { formatTable } from "../format.js";

describe("formatTable", () => {
  it("formats as pipe-delimited table", () => {
    const rows = [
      { Title: "Post 1", Status: "Draft" },
      { Title: "Post 2", Status: "Published" },
    ];
    const result = formatTable(rows, ["Title", "Status"]);
    expect(result).toContain("Title | Status");
    expect(result).toContain("Post 1 | Draft");
    expect(result).toContain("Post 2 | Published");
  });

  it("includes count footer", () => {
    const rows = [{ Title: "A" }];
    const result = formatTable(rows, ["Title"], { total: 10 });
    expect(result).toContain("returned: 1 | total: 10");
  });

  it("omits columns that are empty for all rows", () => {
    const rows = [
      { Title: "A", Status: "", Notes: "" },
      { Title: "B", Status: "", Notes: "" },
    ];
    const result = formatTable(rows, ["Title", "Status", "Notes"]);
    expect(result).toContain("Title");
    expect(result).not.toContain("Status");
    expect(result).not.toContain("Notes");
  });

  it("truncates long cell values", () => {
    const rows = [{ Title: "a".repeat(100) }];
    const result = formatTable(rows, ["Title"]);
    expect(result).toContain("…");
    expect(result.length).toBeLessThan(200);
  });

  it("handles empty rows", () => {
    const result = formatTable([], ["Title", "Status"]);
    expect(result).toContain("No results");
  });

  it("uses all row keys when no columns specified", () => {
    const rows = [{ A: "1", B: "2" }];
    const result = formatTable(rows);
    expect(result).toContain("A | B");
  });
});
