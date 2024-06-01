/**
 * This module provides a key-value store interface for Turso, allowing for
 * basic CRUD operations, transactions, and synchronization with a read replica.
 *
 * ```ts
 * import { openKV } from "jsr:@router/kv";
 *
 * const kv = await openKV("libsql://example.turso.io", "authToken");
 *
 * const record = await kv.get<number>("temperature:london");
 * console.log(record); // { k: "temperature:london", v: 16, created_at: "...", updated_at: "..." }
 * ```
 *
 * @module
 */

import { createClient, load } from "./deps.ts";
import { KVError, setupDatabase } from "./utils.ts";

import type {
  EventBuffer,
  EventListener,
  KvEvent,
  KvInterface,
  KvListOptions,
  KvListOutput,
  KvQueryResult,
  KvRecord,
  KvValue,
  OpenKVOptions,
} from "./types.ts";
import type { Client, Config, Transaction, TransactionMode } from "./deps.ts";

await load({ export: true });

/**
 * Opens a connection to the KV database and sets up the necessary structures.
 *
 * @function
 * @param {string} url - The URL of the KV database.
 * @param {string} authToken - The authentication token for the database.
 * @param {OpenKVOptions} [options] - Optional settings for the KV client.
 * @returns {Promise<KvInterface>} A promise that resolves to the KV interface.
 *
 * @example
 * ```ts
 * import { openKV } from "jsr:@router/kv";
 *
 * const kv = await openKV("libsql://example.turso.io", "authToken");
 * console.log("KV database opened");
 * ```
 */
const openKV = async (
  url: string,
  authToken: string,
  options?: OpenKVOptions,
): Promise<KvInterface> => {
  if (!url) {
    throw new Error("DB url missing");
  }

  if (!authToken) {
    throw new Error("DB AuthToken missing");
  }

  if (options?.syncInterval && isNaN(options.syncInterval)) {
    throw new Error("syncInterval must be number");
  }

  const config: Config = {
    url: url,
    syncUrl: undefined,
    authToken: authToken,
    syncInterval: undefined,
  };

  if (options?.readReplicaPath) {
    config.url = options.readReplicaPath;
    config.syncUrl = url;
    config.syncInterval = options?.syncInterval;
  }

  const client = createClient(config);
  await setupDatabase(client);
  return kvInterface(client, options?.eventListener);
};

/**
 * Provides the KV interface with methods to interact with the KV table.
 *
 * @param {Client | Transaction} instance - The database client or transaction instance.
 * @param {EventListener} [eventListener] - Optional event listener for KV events.
 * @returns {KvInterface} The KV interface.
 */
const kvInterface = (
  instance: Client | Transaction,
  eventListener?: EventListener,
): KvInterface => {
  const eventBuffer: EventBuffer = [];
  return {
    get getEventBuffer() {
      return eventBuffer;
    },

    /**
     * Sets a key-value pair in the KV table.
     *
     * @param {string} key - The key to set/update.
     * @param {KvValue} value - The value to set.
     * @template T - Optional template to cast return objects value property from KvValue to T.
     * @returns {Promise<KvRecord<T> | null>} KvRecord object describing the record of the KV store that has been set, alternatively returns null if key has been set to null.
     *
     * @example
     * ```ts
     * const record = await kv.set<number>("temperature:london", 16);
     * console.log(record); // { k: "temperature:london", v: 16, created_at: "...", updated_at: "..." }
     * ```
     */
    async set<T>(key: string, value: KvValue): Promise<KvRecord<T> | null> {
      try {
        if (value === null) {
          await this.delete(key);
          return null;
        }

        const valueBlob = JSON.stringify(value);
        const resultSet = await instance.batch([
          {
            sql: "INSERT OR REPLACE INTO kv (k, v) VALUES (?, ?);",
            args: [key, valueBlob],
          },
          { sql: "SELECT * FROM kv WHERE k = ?", args: [key] },
        ]);

        const result = resultSet[1].rows[0] as unknown as KvQueryResult;
        const record: KvRecord<T> = { ...result, v: JSON.parse(result.v) as T };
        const kvEvent: KvEvent = { type: "set", data: record };

        if (eventListener) {
          if (this.isTransaction()) {
            eventBuffer.push(kvEvent);
          } else {
            await eventListener?.(kvEvent);
          }
        }

        return record;
      } catch (error) {
        throw new KVError(error);
      }
    },

    /**
     * Retrieves the value for a specified key if it exists.
     *
     * @param {string} key - The key to retrieve the value for.
     * @template T - Optional template to cast return objects value property from KvValue to T.
     * @returns {Promise<KvRecord<T> | null>} The KvRecord object describing the record corresponding to the given key if it exists in the table, else null.
     *
     * @example
     * ```ts
     * const record = await kv.get<number>("temperature:london");
     * console.log(record); // { k: "temperature:london", v: 16, created_at: "...", updated_at: "..." }
     * ```
     */
    async get<T>(key: string): Promise<KvRecord<T> | null> {
      try {
        const resultSet = await instance.execute({
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
    },

    /**
     * Lists entries in the KV table based on prefix and other options.
     *
     * @param {string} prefix - Allows for optional filtering by matching prefixes, set this to "" to include all keys.
     * @param {Partial<KvListOptions>} [options] - The options that pick the ordering, pagination, and whether to include exact prefix match.
     * @template T - Optional template to cast return objects value property from KvValue to T.
     * @returns {Promise<KvListOutput<T>>} KvListOutput object containing the array of KvRecord objects describing the query result, and a meta object describing the options that called the KvInterface.list, as well as the number of rows.
     *
     * @example
     * ```ts
     * const result = await kv.list<number>("temperature:");
     * console.log(result); // { data: [...], meta: { limit: 100, offset: 0, reverse: false, orderBy: "k", total: ... } }
     * ```
     */
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

        const resultSet = await instance.batch(
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
    },

    /**
     * Deletes a specific key-value pair if it exists.
     *
     * @param {string} key - Key for which removal of KV pair will occur, if it exists.
     * @returns {Promise<void>}
     *
     * @example
     * ```ts
     * await kv.delete("temperature:london");
     * console.log("Record deleted");
     * ```
     */
    async delete(key: string): Promise<void> {
      try {
        const resultSet = await instance.batch([
          { sql: "SELECT * FROM kv WHERE k = ?", args: [key] },
          {
            sql: "DELETE FROM kv WHERE k=?;",
            args: [key],
          },
        ]);

        if (eventListener) {
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
            eventBuffer.push(event);
          } else {
            await eventListener?.(event);
          }
        }

        return;
      } catch (error) {
        throw new KVError(error);
      }
    },

    /**
     * Deletes all key-value pairs with keys beginning with prefix in the KV table. Should be used with extreme caution.
     *
     * @param {string} [prefix=""] - All records with key starting with this string will be deleted. Not providing prefix will cause all delete ALL records.
     * @returns {Promise<void>}
     *
     * @example
     * ```ts
     * await kv.deleteAll("temperature:");
     * console.log("All records with the prefix deleted");
     * ```
     */
    async deleteAll(prefix: string = ""): Promise<void> {
      try {
        if (prefix) {
          prefix = `${prefix}:`;
        }

        await instance.execute({
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
    },

    /**
     * Executes a series of operations within a transaction, ensuring all or nothing execution.
     *
     * @param {(tx: KvInterface) => Promise<T>} cb - The functionality to be run within the transaction.
     * @param {TransactionMode} [mode="write"] - The transaction mode.
     * @template T - Type of the return value of the user-defined callback function.
     * @returns {Promise<T>} Returns whatever is returned by the user-defined cb function.
     *
     * @example
     * ```ts
     * await kv.transaction(async (tx) => {
     *   await tx.set("temperature:london", "16");
     *   await tx.set("temperature:rio_de_janeiro", "28");
     * });
     * console.log("Transaction committed");
     * ```
     */
    async transaction<T>(
      cb: (tx: KvInterface) => Promise<T>,
      mode: TransactionMode = "write",
    ): Promise<T> {
      if (this.isTransaction()) {
        throw new KVError("Nested transactions are not supported.");
      }
      const kvTransaction = await (instance as Client).transaction(mode);
      try {
        const tx = kvInterface(kvTransaction, eventListener);
        const transactionRes = await cb(tx);
        await kvTransaction.commit();

        for (const event of tx.getEventBuffer) {
          await eventListener?.(event);
        }

        return transactionRes;
      } catch (error) {
        await kvTransaction.rollback();
        throw new KVError(error);
      } finally {
        kvTransaction.close();
      }
    },

    /**
     * Synchronizes the embedded KV read-replica with the remote database.
     *
     * @returns {Promise<void>}
     *
     * @example
     * ```ts
     * await kv.sync();
     * console.log("KV database synchronized");
     * ```
     */
    async sync(): Promise<void> {
      if ("sync" in instance && typeof instance.sync === "function") {
        await instance.sync();
      }
    },

    /**
     * Checks if the current operation is part of a transaction.
     *
     * @returns {boolean} Returns true if the current operation is part of a transaction, else false.
     */
    isTransaction(): boolean {
      return (
        !("transaction" in instance) ||
        typeof instance.transaction !== "function"
      );
    },

    /**
     * Closes the KV client and cleans up resources.
     *
     * @returns {void}
     *
     * @example
     * ```ts
     * kv.close();
     * console.log("KV client closed");
     * ```
     */
    close(): void {
      try {
        instance.close();
      } catch (error) {
        throw new KVError(error);
      }
    },
  };
};

export { openKV };
