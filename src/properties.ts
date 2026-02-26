export function extractProperty(prop: any): string {
  if (!prop) return "";
  switch (prop.type) {
    case "title":
      return prop.title?.map((t: any) => t.plain_text).join("") ?? "";
    case "rich_text":
      return truncate(prop.rich_text?.map((t: any) => t.plain_text).join("") ?? "", 200);
    case "number":
      return prop.number != null ? String(prop.number) : "";
    case "select":
      return prop.select?.name ?? "";
    case "multi_select":
      return prop.multi_select?.map((s: any) => s.name).join(", ") ?? "";
    case "status":
      return prop.status?.name ?? "";
    case "date":
      if (!prop.date) return "";
      return prop.date.end ? `${prop.date.start} → ${prop.date.end}` : prop.date.start ?? "";
    case "checkbox":
      return prop.checkbox ? "Yes" : "No";
    case "url":
      return prop.url ?? "";
    case "email":
      return prop.email ?? "";
    case "people":
      return prop.people?.map((p: any) => p.name).join(", ") ?? "";
    case "formula":
      return extractFormula(prop.formula);
    case "rollup":
      return extractRollup(prop.rollup);
    case "relation":
      return `${prop.relation?.length ?? 0} linked`;
    default:
      return "[unsupported]";
  }
}

function truncate(s: string, max: number): string {
  return s.length > max ? s.slice(0, max) + "…" : s;
}

function extractFormula(f: any): string {
  if (!f) return "";
  switch (f.type) {
    case "string": return f.string ?? "";
    case "number": return f.number != null ? String(f.number) : "";
    case "boolean": return f.boolean ? "Yes" : "No";
    case "date": return f.date?.start ?? "";
    default: return "";
  }
}

function extractRollup(r: any): string {
  if (!r) return "";
  switch (r.type) {
    case "number": return r.number != null ? String(r.number) : "";
    case "date": return r.date?.start ?? "";
    case "array": return `${r.array?.length ?? 0} items`;
    default: return "";
  }
}
