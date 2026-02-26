import { describe, it, expect } from "vitest";
import { handleHelp } from "../modes/help.js";

describe("handleHelp", () => {
  it("lists available topics when no topic given", async () => {
    const result = JSON.parse(await handleHelp({ mode: "help" }));
    expect(result.topics).toContain("query");
    expect(result.topics).toContain("search");
    expect(result.topics).toContain("read");
    expect(result.topics).toContain("create");
    expect(result.topics).toContain("update");
  });

  it("returns docs for valid topic", async () => {
    const result = JSON.parse(await handleHelp({ mode: "help", topic: "query" }));
    expect(result.topic).toBe("query");
    expect(result.docs).toBeTruthy();
    expect(result.docs).toContain("filter");
  });

  it("rejects path traversal attempt", async () => {
    const result = JSON.parse(await handleHelp({ mode: "help", topic: "../../../etc/passwd" }));
    expect(result.error).toBeDefined();
    expect(result.suggestion).toContain("Valid topics");
  });

  it("rejects unknown topic", async () => {
    const result = JSON.parse(await handleHelp({ mode: "help", topic: "delete" }));
    expect(result.error).toBeDefined();
  });
});
