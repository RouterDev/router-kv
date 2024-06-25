import { createClient } from "./deps.ts";
import { KVError, setupDatabase } from "./utils.ts";

import type {
  Json,
  KvEvent,
  KvEventListener,
  KvInterface,
  KvListOptions,
  KvListOutput,
  KvMetaData,
  KvQueryResult,
  KvRecord,
  KvSetOptions,
  KvValue,
  OpenKVOptions,
} from "./types.ts";
import type { Client, Config, Transaction, TransactionMode } from "./deps.ts";

/**
 * Opens a connection to the KV database and sets up the necessary structures.
 *
 * @param {string} url - The URL of the KV database.
 * @param {OpenKVOptions} [options] - Optional settings for the KV client.
 * @returns {Promise<KvInterface>} A promise that resolves to the KV interface.
 *
 * @example
 * ```ts
 * import { openKV } from "jsr:@router/kv";
 *
 * const kv = await openKV("libsql://example.turso.io", {
 *  authToken: "authToken"
 * });
 * console.log("KV database opened");
 * ```
 */
async function openKV(
  url: string,
  options?: OpenKVOptions,
): Promise<KvInterface> {
  if (!url) {
    throw new Error("DB url missing");
  }

  if (options?.syncInterval && isNaN(options.syncInterval)) {
    throw new Error("syncInterval must be number");
  }

  const config: Config = {
    url: url,
    syncUrl: undefined,
    authToken: options?.authToken,
    syncInterval: undefined,
  };

  if (options?.embeddedReplicaPath) {
    config.url = options.embeddedReplicaPath;
    config.syncUrl = url;
    config.syncInterval = options?.syncInterval;
  }

  const client = createClient(config);
  await setupDatabase(client);
  return new Kv(client, options?.eventListener);
}

/**
 * Provides the KV interface with methods to interact with the KV table.
 *
 * @param {Client | Transaction} instance - The database client or transaction instance.
 * @param {KvEventListener} [eventListener] - Optional event listener for KV events.
 * @returns {KvInterface} The KV interface.
 */
class Kv implements KvInterface {
  eventBuffer: Array<KvEvent>;
  instance: Client | Transaction;
  eventListener?: KvEventListener;

  constructor(instance: Client | Transaction, eventListener?: KvEventListener) {
    this.eventBuffer = [];
    this.instance = instance;
    this.eventListener = eventListener;
  }

  async set<T>(
    key: string,
    value: KvValue,
    options?: Partial<KvSetOptions>,
  ): Promise<KvRecord<T> | null | void> {
    try {
      if (value === null) {
        await this.delete(key);
        return null;
      }

      const defaultOptions = {
        returning: true,
      };

      const mergedOptions = { ...defaultOptions, ...options };

      const valueBlob = JSON.stringify(value);

      const queryBatch = [{
        sql:
          "INSERT INTO kv (k, v) VALUES (?, ?) ON CONFLICT(k) DO UPDATE SET v = ?;",
        args: [key, valueBlob, valueBlob],
      }];

      if (mergedOptions.returning) {
        queryBatch.push(
          {
            sql: "SELECT * FROM kv WHERE k = ?",
            args: [key],
          },
        );
      }

      const resultSet = await this.instance.batch(queryBatch);
      let record: KvRecord<T> | undefined;

      if (mergedOptions.returning) {
        const result = resultSet[1].rows[0] as unknown as KvQueryResult;
        record = { ...result, v: JSON.parse(result.v) as T };

        if (this.eventListener) {
          const kvEvent: KvEvent = { type: "set", data: record };
          if (this.isTransaction()) {
            this.eventBuffer.push(kvEvent);
          } else {
            await this.eventListener?.(kvEvent);
          }
        }
      }

      return record;
    } catch (error) {
      throw new KVError(error);
    }
  }

  async get<T>(key: string): Promise<KvRecord<T> | null> {
    try {
      const resultSet = await this.instance.execute({
        sql: `
          SELECT k, v, created_at, updated_at
          FROM kv 
          WHERE k=?
          `,
        args: [key],
      });

      if (!resultSet.rows.length) {
        return null;
      }

      const result = resultSet.rows[0] as unknown as KvQueryResult;

      return {
        k: result.k,
        v: JSON.parse(result.v) as T,
        created_at: result.created_at,
        updated_at: result.updated_at,
      };
    } catch (error) {
      throw new KVError(error);
    }
  }

  async list<T>(
    prefix: string,
    options?: Partial<KvListOptions>,
  ): Promise<KvListOutput<T>> {
    try {
      const defaultOptions: KvListOptions = {
        limit: 100,
        offset: 0,
        reverse: false,
        orderBy: "k",
        includeExactMatch: false,
      };

      const mergedOptions = {
        ...defaultOptions,
        ...options,
      };

      const { limit, offset, reverse, orderBy, includeExactMatch } =
        mergedOptions;

      const validColumns = ["k", "v", "created_at", "updated_at"];
      if (!validColumns.includes(orderBy)) {
        throw new KVError(`Invalid orderBy column: ${orderBy}.`);
      }

      const query = prefix;
      const queryWithColon = prefix && !prefix.endsWith(":")
        ? `${prefix}:`
        : prefix;
      let whereCondition = "k LIKE ? || '%' ";

      const args = [queryWithColon];

      if (includeExactMatch) {
        whereCondition += " OR k = ?";
        args.push(query);
      }

      const orderDirection = reverse ? "DESC" : "ASC";
      let orderQuery = `${orderBy} ${orderDirection}`;
      if (orderBy !== defaultOptions.orderBy) {
        orderQuery += `, ${defaultOptions.orderBy} ${orderDirection}`;
      }

      const resultSet = await this.instance.batch(
        [
          {
            sql: `
          SELECT k,v,created_at,updated_at 
          FROM kv
          WHERE ${whereCondition}
          ORDER BY ${orderQuery}
          LIMIT ?
          OFFSET ?;
          `,
            args: [...args, limit, offset],
          },
          {
            sql: `SELECT COUNT(*) as total FROM kv WHERE ${whereCondition};`,
            args: args,
          },
        ],
        "read",
      );

      const result = resultSet[0].rows as unknown as KvQueryResult[];
      const total = Number(resultSet[1].rows[0].total) ?? 0;

      const parsedRows = result.map((prop) => ({
        ...prop,
        v: JSON.parse(prop.v) as T,
      }));

      return {
        data: parsedRows,
        meta: { total, ...mergedOptions },
      };
    } catch (error) {
      throw new KVError(error);
    }
  }

  async delete(key: string): Promise<void> {
    try {
      const resultSet = await this.instance.batch([
        { sql: "SELECT * FROM kv WHERE k = ?", args: [key] },
        {
          sql: "DELETE FROM kv WHERE k=?;",
          args: [key],
        },
      ]);

      if (this.eventListener) {
        const now = new Date().toISOString().slice(0, 19).replace("T", " ");
        const result = resultSet[0].rows[0] as unknown as KvQueryResult;
        const record: KvRecord<null> = {
          ...result,
          v: null,
          updated_at: now,
        };

        const event: KvEvent = {
          type: "delete",
          data: record,
        };

        if (this.isTransaction()) {
          this.eventBuffer.push(event);
        } else {
          await this.eventListener?.(event);
        }
      }

      return;
    } catch (error) {
      throw new KVError(error);
    }
  }

  async deleteAll(prefix: string = ""): Promise<void> {
    try {
      if (prefix) {
        prefix = `${prefix}:`;
      }

      await this.instance.execute({
        sql: `
          DELETE FROM kv 
          WHERE k LIKE ? || '%'
          `,
        args: [prefix],
      });
      return;
    } catch (error) {
      throw new KVError(error);
    }
  }

  async transaction<T>(
    cb: (tx: KvInterface) => Promise<T>,
    mode: TransactionMode = "write",
  ): Promise<T> {
    if (this.isTransaction()) {
      throw new KVError("Nested transactions are not supported.");
    }
    const kvTransaction = await (this.instance as Client).transaction(mode);
    try {
      const tx = new Kv(kvTransaction, this.eventListener);
      const transactionRes = await cb(tx);
      await kvTransaction.commit();

      for (const event of tx.eventBuffer) {
        await this.eventListener?.(event);
      }

      return transactionRes;
    } catch (error) {
      await kvTransaction.rollback();
      throw new KVError(error);
    } finally {
      kvTransaction.close();
    }
  }

  async sync(): Promise<void> {
    if ("sync" in this.instance && typeof this.instance.sync === "function") {
      await this.instance.sync();
    }
  }

  isTransaction(): boolean {
    return (
      !("transaction" in this.instance) ||
      typeof this.instance.transaction !== "function"
    );
  }

  close(): void {
    try {
      this.instance.close();
    } catch (error) {
      throw new KVError(error);
    }
  }
}

export { openKV };
export type {
  Json,
  KvEvent,
  KvEventListener,
  KvInterface,
  KvListOptions,
  KvListOutput,
  KvMetaData,
  KvRecord,
  KvValue,
  OpenKVOptions,
};
