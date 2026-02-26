export function formatTable(
  rows: Record<string, string>[],
  columns?: string[],
  opts?: { total?: number }
): string {
  if (rows.length === 0) return "No results";

  const cols = columns ?? Object.keys(rows[0]);

  // Filter out columns that are empty for all rows
  const activeCols = cols.filter((col) =>
    rows.some((row) => (row[col] ?? "").trim() !== "")
  );

  if (activeCols.length === 0) return "No results";

  const header = activeCols.join(" | ");

  const dataRows = rows.map((row) =>
    activeCols.map((col) => truncateCell(row[col] ?? "")).join(" | ")
  );

  const footer = `returned: ${rows.length}${opts?.total != null ? ` | total: ${opts.total}` : ""}`;

  return [header, ...dataRows, footer].join("\n");
}

function truncateCell(value: string, max = 80): string {
  return value.length > max ? value.slice(0, max) + "…" : value;
}
