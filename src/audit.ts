import * as fs from "fs/promises";
import * as path from "path";

export interface AuditEntry {
  mode: string;
  database: string;
  page_id: string;
  fields_sent: string[];
  clear_fields: string[];
  previous_values: Record<string, unknown>;
}

export class AuditLog {
  private dir: string;

  constructor(dir: string) {
    this.dir = dir;
  }

  async log(entry: AuditEntry): Promise<void> {
    await fs.mkdir(this.dir, { recursive: true });
    const date = new Date().toISOString().slice(0, 10);
    const filePath = path.join(this.dir, `writes-${date}.jsonl`);
    const line = JSON.stringify({ ts: new Date().toISOString(), ...entry }) + "\n";
    await fs.appendFile(filePath, line, "utf-8");
  }
}
