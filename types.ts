import type { Value } from "./deps.ts";

/**
 * Type encompassing all non-BLOB types that can be stored as values in the KV table.
 */
export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[];

/**
 * Type encompassing all possible types that can be stored in the KV table as a value.
 */
export type KvValue = Value | Json;

/**
 * Describes the parameters used for pagination and ordering in `KvInterface.list()`.
 *
 * @typedef {Object} KvListOptions
 * @property {number} [limit=100] - The maximum number of results to be obtained.
 * @property {number} [offset=0] - The number of rows to skip.
 * @property {boolean} [reverse=false] - Set to true to reverse the ordering of results.
 * @property {('k' | 'v' | 'created_at' | 'updated_at')} [orderBy='k'] - Column of the KV table to order results by.
 * @property {boolean} [includeExactMatch=false] - Set to true to include exact matches with `KvInterface.list()` parameter `prefix`.
 */
export type KvListOptions = {
  limit: number;
  offset: number;
  reverse: boolean;
  orderBy: keyof KvRecord;
  includeExactMatch: boolean;
};

/**
 * Interface describing Metadata object containing the `limit`, `offset`, `reverse`, `orderBy`, and `includeExactMatch`
 * of a `KvInterface.list()` operation, as well as `total` - the number of KV entries, to be returned as the `meta` property of that operations return value.
 */
export interface KvMetaData extends KvListOptions {
  total: number;
}

/**
 * Describes the output of `KvInterface.list()`.
 *
 * @typedef {Object} KvListOutput
 * @property {KvRecord[]} data - The query result in the form of an array of objects representing each row.
 * @property {KvMetaData} meta - Metadata object containing the `limit`, `offset`, `reverse`, `orderBy`, and `total` of the `KvInterface.list()` operation that returned this `KvListOutput`.
 */
export type KvListOutput<T> = {
  data: KvRecord<T>[];
  meta: KvMetaData;
};

/**
 * Interface for the main KV client, providing comprehensive methods to interact with the KV table.
 * Each method supports synchronous and transactional operations, ensuring data consistency and integrity.
 */
export interface KvInterface {
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
   * const record = await kv.set<number>("scores:@gillmanseb", 42);
   * console.log(record); // { k: "scores:@gillmanseb", v: 42, created_at: "...", updated_at: "..." }
   * ```
   */
  set<T>(key: string, value: KvValue): Promise<KvRecord<T> | null>;

  /**
   * Retrieves the value for a specified key if it exists.
   *
   * @param {string} key - The key to retrieve the value for.
   * @template T - Optional template to cast return objects value property from KvValue to T.
   * @returns {Promise<KvRecord<T> | null>} The KvRecord object describing the record corresponding to the given key if it exists in the table, else null.
   *
   * @example
   * ```ts
   * const record = await kv.get<number>("scores:@gillmanseb");
   * console.log(record); // { k: "scores:@gillmanseb", v: 42, created_at: "...", updated_at: "..." }
   * ```
   */
  get<T>(key: string): Promise<KvRecord<T> | null>;

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
   * const result = await kv.list<number>("scores:");
   * console.log(result); // { data: [...], meta: { limit: 100, offset: 0, reverse: false, orderBy: "k", total: ... } }
   * ```
   */
  list<T>(
    prefix: string,
    options?: Partial<KvListOptions>,
  ): Promise<KvListOutput<T>>;

  /**
   * Deletes a specific key-value pair if it exists.
   *
   * @param {string} key - Key for which removal of KV pair will occur, if it exists.
   * @returns {Promise<void>}
   *
   * @example
   * ```ts
   * await kv.delete("scores:@gillmanseb");
   * console.log("Record deleted");
   * ```
   */
  delete(key: string): Promise<void>;

  /**
   * Deletes all key-value pairs with keys beginning with prefix in the KV table. Should be used with extreme caution.
   *
   * @param {string} [prefix=""] - All records with key starting with this string will be deleted. Not providing prefix will cause all delete ALL records.
   * @returns {Promise<void>}
   *
   * @example
   * ```ts
   * await kv.deleteAll("scores:");
   * console.log("All records with the prefix deleted");
   * ```
   */
  deleteAll(prefix?: string): Promise<void>;

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
   * try {
   *  const bonusValue = 100;
   *
   *  const score = await kv.transaction<number>(async (tx) => {
   *    // check if the user has claimed the bonus already
   *    const hasClaimedBonus = await tx.get(`bonuses:${user}`) as KvQueryResult<number>;
   *    if (hasClaimedBonus) {
   *      throw new Error("Bonus already claimed!");
   *    }
   *
   *    // get the users current score
   *    const usersScore = await tx.get(`scores:${user}`) as KvQueryResult<number>;
   *
   *    // calculate the users updated score
   *    const currentScore = usersScore?.v ?? 0
   *    const updatedScore = currentScore + bonusValue;
   *
   *    // update the users score
   *    await tx.set(`scores:${user}`, updatedScore);
   *
   *    // mark the user as having claimed the bonus
   *    await tx.set(`bonuses:${user}`, true);
   *
   *    // return the updated score
   *    return updatedScore;
   *  });
   *
   *  console.log(
   *    "Bonus applied!",
   *    `Your new score is ${score}`,
   *  );
   * } catch (error) {
   *   console.error(error.message);
   * }
   * console.log("Transaction committed");
   * ```
   */
  transaction<T = unknown>(cb: (tx: KvInterface) => Promise<T>): Promise<T>;

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
  sync(): Promise<void>;

  /**
   * Checks if the current operation is part of a transaction.
   *
   * @returns {boolean} Returns true if the current operation is part of a transaction, else false.
   */
  isTransaction(): boolean;

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
  close(): void;
}

/**
 * Describes KV query results obtained from methods such as `KvInterface.get()` and `kv.list()`.
 *
 * @typedef {Object} KvRecord
 * @template T - Type of the value column in the KV query result.
 * @property {string} k - Key column of the KV query result.
 * @property {T} v - Value column of the KV query result.
 * @property {string} created_at - `created_at` column of the KV query result.
 * @property {string} updated_at - `updated_at` column of the KV query result.
 */
export type KvRecord<T = KvValue> = {
  k: string;
  v: T;
  created_at: string;
  updated_at: string;
};

/**
 * Type returned by KV query commands such as get, set, and list (as part of KvListOutput).
 * Casts value field to string.
 */
export type KvQueryResult = KvRecord<string>;

/**
 * User provided callback function to be executed on KvEvent objects.
 * Triggered upon set and delete executions.
 *
 * @callback EventListener
 * @param {KvEvent} kvEvent - Object passed by set or delete executions. Gives context on what method called the eventListener, and contains the updated rows.
 */
export type KvEventListener = (kvEvent: KvEvent) => Promise<void>;

/**
 * The optional object optionally containing embeddedReplicaPath, syncInterval, and eventListener.
 *
 * @typedef {Object} OpenKVOptions
 * @property {string} [embeddedReplicaPath] - The file path of the local DB to be used for read operations.
 * @property {number} [syncInterval] - The number of seconds between each sync from the Turso DB to the local read replica.
 * @property {KvEventListener} [eventListener] - If provided, this function will be called when get and delete methods and will be supplied a KvEvent object detailing the changes to the KV.
 */
export type OpenKVOptions = {
  embeddedReplicaPath?: string;
  syncInterval?: number;
  eventListener?: KvEventListener;
};

/**
 * The type of the object that is given to the user-provided eventListener function.
 *
 * @typedef {Object} KvEvent
 * @property {'set'|'delete'} type - String stating what KV method has caused the KvEvent.
 * @property {KvRecord<unknown>|KvRecord<null>} data - KvRecord object reflecting the KV record that has been added/updated/deleted.
 */
export type KvEvent =
  | {
    type: "set";
    data: KvRecord<unknown>;
  }
  | {
    type: "delete";
    data: KvRecord<null>;
  };
