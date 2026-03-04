export function formatTable(
  rows: Record<string, string>[],
  columns?: string[],
  opts?: { fetched?: number; estimatedTotal?: number | null }
): string {
  if (rows.length === 0) return "No results";

  const cols = columns ?? Object.keys(rows[0]);

  const activeCols = cols.filter((col) =>
    rows.some((row) => (row[col] ?? "").trim() !== "")
  );

  if (activeCols.length === 0) return "No results";

  const header = activeCols.join(" | ");

  const dataRows = rows.map((row) =>
    activeCols.map((col) => truncateCell(row[col] ?? "")).join(" | ")
  );

  let footer = `fetched: ${opts?.fetched ?? rows.length}`;
  if (opts?.estimatedTotal != null) {
    footer += ` | estimated_total: ~${opts.estimatedTotal} | ⚠️ CACHED count (5m TTL, may be stale - verify critical decisions)`;
  }

  return [header, ...dataRows, footer].join("\n");
}

function truncateCell(value: string, max = 80): string {
  return value.length > max ? value.slice(0, max) + "…" : value;
}
