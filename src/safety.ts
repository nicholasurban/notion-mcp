/**
 * Write safety module: allowlist validation + empty-value stripping.
 * Used by update.ts and create.ts to enforce per-database write rules.
 */

export function validateWriteAllowlist(
  properties: Record<string, unknown>,
  allowlist: string[],
  clearFields?: string[],
): string | null {
  if (allowlist.length === 0 && (Object.keys(properties).length > 0 || (clearFields?.length ?? 0) > 0)) {
    return "No fields are writable on this database (writeAllowlist is empty)";
  }

  const allowed = new Set(allowlist);
  const rejected: string[] = [];

  for (const key of Object.keys(properties)) {
    if (!allowed.has(key)) rejected.push(key);
  }

  if (clearFields) {
    for (const key of clearFields) {
      if (!allowed.has(key)) rejected.push(key);
    }
  }

  if (rejected.length > 0) {
    return `Properties not in writeAllowlist: ${rejected.join(", ")}. Allowed: ${allowlist.join(", ")}`;
  }

  return null;
}

export function stripEmptyValues(
  properties: Record<string, unknown>,
): Record<string, unknown> {
  return Object.fromEntries(
    Object.entries(properties).filter(([_, v]) => {
      if (v === null || v === undefined) return false;
      if (v === "") return false;
      if (Array.isArray(v) && v.length === 0) return false;
      return true;
    })
  );
}
