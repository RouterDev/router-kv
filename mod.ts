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
 * @description Function that opens the client with the DB, creates table+triggers if they do not exist, and returns a set of functions for interfacing with the DB as a KV store.
 *
 * @param {string} url - The url of the Turso DB that will store the kv table and be interfaced as a KV store.
 * @param {string} authToken - The token for authorising access to the DB specified by url
 * @param {OpenKVOptions} [options] - The optional object optionally containing readReplicaPath, syncInterval, and eventListener
 * @param {string|undefined} [options].?readReplicaPath - The file path of the local read replica DB to be used for read operations.
 * @param {number|undefined} [options].?syncInterval - The number of seconds between each sync from the Turso DB to the local read replica.
 * @param {EventListener|undefined} [options].?eventListener - If provided, this function will be called when get and delete methods and will be supplied a KvEvent object detailing the changes to the KV.
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

const kvInterface = (
  instance: Client | Transaction,
  eventListener?: EventListener,
): KvInterface => {
  const eventBuffer: EventBuffer = [];
  return {
    get getEventBuffer() {
      return eventBuffer;
    },

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
    async sync(): Promise<void> {
      if ("sync" in instance && typeof instance.sync === "function") {
        await instance.sync();
      }
    },
    isTransaction(): boolean {
      return (
        !("transaction" in instance) ||
        typeof instance.transaction !== "function"
      );
    },
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
