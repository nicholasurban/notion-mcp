// Read-only types that Notion does not allow writing to
const READ_ONLY_TYPES = new Set([
  "formula", "rollup", "created_by", "created_time",
  "last_edited_by", "last_edited_time", "unique_id", "button",
]);

/**
 * Shared helper: convert user-facing key-value properties into
 * Notion API property format using the database schema.
 *
 * Returns { properties, skipped } so callers can report dropped fields.
 */
export function buildProperties(
  props: Record<string, unknown>,
  schema: Record<string, string>,
): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  const skipped: Array<{ field: string; type: string; reason: string }> = [];

  for (const [key, value] of Object.entries(props)) {
    const type = schema[key];
    if (!type) continue; // skip unknown properties

    switch (type) {
      case "title":
        result[key] = { title: [{ text: { content: String(value) } }] };
        break;
      case "rich_text":
        result[key] = { rich_text: [{ text: { content: String(value) } }] };
        break;
      case "number":
        result[key] = { number: Number(value) };
        break;
      case "select":
        result[key] = { select: { name: String(value) } };
        break;
      case "multi_select":
        result[key] = {
          multi_select: (Array.isArray(value) ? value : String(value).split(",").map((s) => s.trim()))
            .map((name: string) => ({ name })),
        };
        break;
      case "status":
        result[key] = { status: { name: String(value) } };
        break;
      case "date":
        result[key] = typeof value === "object" && value !== null
          ? { date: value }
          : { date: { start: String(value) } };
        break;
      case "checkbox":
        result[key] = { checkbox: Boolean(value) };
        break;
      case "url":
        result[key] = { url: String(value) };
        break;
      case "email":
        result[key] = { email: String(value) };
        break;
      case "relation":
        result[key] = {
          relation: (Array.isArray(value) ? value : [value]).map((id: string) => ({ id })),
        };
        break;
      case "files": {
        // Accept a URL string, an array of URL strings, or Notion file objects
        const urls = Array.isArray(value) ? value : [value];
        result[key] = {
          files: urls.map((item: unknown) => {
            if (typeof item === "string") {
              // Derive a filename from the URL or use the raw string
              const name = item.split("/").pop()?.split("?")[0] || String(item);
              return { name, type: "external", external: { url: item } };
            }
            // Already a Notion file object (e.g. {name, external: {url}})
            return item;
          }),
        };
        break;
      }
      default:
        if (READ_ONLY_TYPES.has(type)) {
          skipped.push({ field: key, type, reason: "read-only" });
        } else {
          skipped.push({ field: key, type, reason: "unsupported type" });
        }
        break;
    }
  }

  // Attach skipped info so callers can surface it
  if (skipped.length > 0) {
    (result as any).__skipped = skipped;
  }

  return result;
}
