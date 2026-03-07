/**
 * Convert a URL-derived filename into clean, human-readable alt text.
 * "solshine-photovites-emf-tested-1.jpeg" → "Solshine Photovites EMF Tested"
 */
function cleanFileName(urlOrName: string): string {
  // Extract filename from URL
  let name = urlOrName.split("/").pop()?.split("?")[0] || urlOrName;
  // Strip file extension
  name = name.replace(/\.[a-z0-9]+$/i, "");
  // Strip trailing number suffixes like -1, -2, -scaled, -scaled-1
  name = name.replace(/[-_](?:scaled|[0-9]+)(?:[-_](?:scaled|[0-9]+))*$/, "");
  // Replace hyphens and underscores with spaces
  name = name.replace(/[-_]+/g, " ");
  // Title case: capitalize first letter of each word
  name = name.replace(/\b\w/g, (c) => c.toUpperCase());
  return name.trim();
}

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
        // Accept: URL string, {url, name} object, array of either, or Notion file objects
        const items = Array.isArray(value) ? value : [value];
        result[key] = {
          files: items.map((item: unknown) => {
            if (typeof item === "string") {
              return { name: cleanFileName(item), type: "external", external: { url: item } };
            }
            if (typeof item === "object" && item !== null) {
              const obj = item as Record<string, unknown>;
              // {url, name} shorthand — name is used as alt text in Notion
              if (obj.url && typeof obj.url === "string") {
                const name = obj.name ? String(obj.name) : cleanFileName(obj.url);
                return { name, type: "external", external: { url: obj.url } };
              }
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
