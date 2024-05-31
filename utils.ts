import type { Client } from "./deps.ts";

/**
 * Custom error class for KV operations.
 *
 * @extends Error
 */
export class KVError extends Error {
  /**
   * Creates an instance of KVError.
   *
   * @param {string} message - The error message.
   */
  constructor(message: string) {
    super(message);
    this.name = this.constructor.name;
  }
}

/**
 * Sets up the database by creating the required table and trigger.
 *
 * This function creates a table named `kv` if it does not already exist, and
 * sets up a trigger to update the `updated_at` timestamp on row updates.
 *
 * @param {Client} instance - The database client instance.
 * @returns {Promise<void>} A promise that resolves when the database setup is complete.
 *
 * @example
 * ```ts
 * import { setupDatabase } from "./utils.ts";
 * import { Client } from "./deps.ts";
 *
 * const client = new Client();
 * await setupDatabase(client);
 * console.log("Database setup complete");
 * ```
 */
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
