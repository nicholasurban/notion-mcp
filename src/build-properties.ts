/**
 * Shared helper: convert user-facing key-value properties into
 * Notion API property format using the database schema.
 */
export function buildProperties(
  props: Record<string, unknown>,
  schema: Record<string, string>,
): Record<string, unknown> {
  const result: Record<string, unknown> = {};

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
      default:
        // Skip unsupported types (formula, rollup, etc.)
        break;
    }
  }

  return result;
}
