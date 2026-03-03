import { z } from "zod";

const ALL_ACTIONS = ["query", "read", "create", "update"] as const;

const DatabaseSchema = z.object({
  id: z.string().min(1),
  description: z.string().default(""),
  fields: z.array(z.string()).default([]),
  writeAllowlist: z.array(z.string()).default([]),
  allowedActions: z.array(z.enum(ALL_ACTIONS)).default([...ALL_ACTIONS]),
  aliases: z.array(z.string()).default([]),
  searchFields: z.array(z.string()).optional(),
});

const ConfigSchema = z.object({
  databases: z.record(z.string(), DatabaseSchema),
});

export type DatabaseConfig = z.infer<typeof DatabaseSchema>;
export type NotionConfig = z.infer<typeof ConfigSchema> & {
  databaseNames: string[];
  aliasMap: Record<string, string>;
};

export function loadConfig(base64: string): NotionConfig {
  const json = JSON.parse(Buffer.from(base64, "base64").toString("utf-8"));
  const parsed = ConfigSchema.parse(json);

  if (Object.keys(parsed.databases).length === 0) {
    throw new Error("Config must define at least one database");
  }

  // Build alias → canonical name lookup
  const aliasMap: Record<string, string> = {};
  for (const [name, db] of Object.entries(parsed.databases)) {
    for (const alias of db.aliases) {
      aliasMap[alias.toLowerCase()] = name;
    }
  }

  return {
    ...parsed,
    databaseNames: Object.keys(parsed.databases),
    aliasMap,
  };
}
