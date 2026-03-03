import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { AuditLog } from "../audit.js";
import * as fs from "fs/promises";
import * as path from "path";
import { tmpdir } from "os";

describe("AuditLog", () => {
  let logDir: string;
  let audit: AuditLog;

  beforeEach(async () => {
    logDir = path.join(tmpdir(), `audit-test-${Date.now()}`);
    await fs.mkdir(logDir, { recursive: true });
    audit = new AuditLog(logDir);
  });

  afterEach(async () => {
    await fs.rm(logDir, { recursive: true, force: true });
  });

  it("writes an audit entry as JSONL", async () => {
    await audit.log({
      mode: "update",
      database: "products-shop",
      page_id: "abc123",
      fields_sent: ["Brand"],
      clear_fields: [],
      previous_values: { Brand: "OldBrand" },
    });

    const files = await fs.readdir(logDir);
    expect(files.length).toBe(1);
    expect(files[0]).toMatch(/^writes-\d{4}-\d{2}-\d{2}\.jsonl$/);

    const content = await fs.readFile(path.join(logDir, files[0]), "utf-8");
    const entry = JSON.parse(content.trim());
    expect(entry.database).toBe("products-shop");
    expect(entry.page_id).toBe("abc123");
    expect(entry.fields_sent).toEqual(["Brand"]);
    expect(entry.ts).toBeDefined();
  });

  it("appends multiple entries to same daily file", async () => {
    await audit.log({ mode: "update", database: "db1", page_id: "p1", fields_sent: ["A"], clear_fields: [], previous_values: {} });
    await audit.log({ mode: "update", database: "db2", page_id: "p2", fields_sent: ["B"], clear_fields: [], previous_values: {} });

    const files = await fs.readdir(logDir);
    expect(files.length).toBe(1);

    const content = await fs.readFile(path.join(logDir, files[0]), "utf-8");
    const lines = content.trim().split("\n");
    expect(lines.length).toBe(2);
  });
});
