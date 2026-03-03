import { describe, it, expect } from "vitest";
import { validateWriteAllowlist, stripEmptyValues } from "../safety.js";

describe("validateWriteAllowlist", () => {
  it("passes when all properties are in allowlist", () => {
    const result = validateWriteAllowlist(
      { Title: "Hello", Status: "Draft" },
      ["Title", "Status", "Brand"],
    );
    expect(result).toBeNull();
  });

  it("rejects properties not in allowlist", () => {
    const result = validateWriteAllowlist(
      { Title: "Hello", SecretField: "bad" },
      ["Title", "Status"],
    );
    expect(result).not.toBeNull();
    expect(result).toContain("SecretField");
  });

  it("rejects all properties when allowlist is empty", () => {
    const result = validateWriteAllowlist(
      { Title: "Hello" },
      [],
    );
    expect(result).not.toBeNull();
  });

  it("validates clear_fields against allowlist", () => {
    const result = validateWriteAllowlist(
      {},
      ["Title", "Status"],
      ["Title"],
    );
    expect(result).toBeNull();
  });

  it("rejects clear_fields not in allowlist", () => {
    const result = validateWriteAllowlist(
      {},
      ["Title"],
      ["SecretField"],
    );
    expect(result).not.toBeNull();
    expect(result).toContain("SecretField");
  });
});

describe("stripEmptyValues", () => {
  it("removes null values", () => {
    expect(stripEmptyValues({ Title: "Hello", Brand: null }))
      .toEqual({ Title: "Hello" });
  });

  it("removes undefined values", () => {
    expect(stripEmptyValues({ Title: "Hello", Brand: undefined }))
      .toEqual({ Title: "Hello" });
  });

  it("removes empty string values", () => {
    expect(stripEmptyValues({ Title: "Hello", Brand: "" }))
      .toEqual({ Title: "Hello" });
  });

  it("removes empty array values", () => {
    expect(stripEmptyValues({ Title: "Hello", Tags: [] }))
      .toEqual({ Title: "Hello" });
  });

  it("keeps non-empty values", () => {
    expect(stripEmptyValues({ Title: "Hello", Tags: ["a"], Count: 0, Active: false }))
      .toEqual({ Title: "Hello", Tags: ["a"], Count: 0, Active: false });
  });

  it("keeps zero and false (not empty)", () => {
    expect(stripEmptyValues({ Count: 0, Active: false }))
      .toEqual({ Count: 0, Active: false });
  });
});
