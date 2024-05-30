import type { Client } from "./deps.ts";

export class KVError extends Error {
  constructor(message: string) {
    super(message);
    this.name = this.constructor.name;
  }
}

export const setupDatabase = async (instance: Client): Promise<void> => {
  await instance.batch(
    [
      `
    CREATE TABLE if not exists kv (
      k BLOB PRIMARY KEY,
      v BLOB NOT NULL,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT DEFAULT CURRENT_TIMESTAMP
    ) WITHOUT ROWID;
    `,
      `
    CREATE TRIGGER if not exists update_kv
    AFTER UPDATE ON kv
    FOR EACH ROW
    BEGIN
      UPDATE kv SET updated_at = CURRENT_TIMESTAMP WHERE k = NEW.k;
    END;
  `,
    ],
    "write",
  );
};
