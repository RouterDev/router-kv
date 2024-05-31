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
 *
 * @interface KvInterface
 */
export type KvInterface = {
  /**
   * Method for accessing the event buffer property used for storing KvEvents whilst in a transaction for passing to the eventListener callback function upon transaction commit.
   */
  get getEventBuffer(): Array<KvEvent>;

  /**
   * Synchronizes the local KV read-replica table with the cloud-based table.
   * @returns {Promise<void>}
   */
  sync(): Promise<void>;

  /**
   * Closes the KV client and cleans up resources.
   */
  close(): void;

  /**
   * Sets a key-value pair in the KV table.
   * @param {string} key - The key to set/update.
   * @param {KvValue} value - The value to set.
   * @template T - Optional template to cast return objects value property from KvValue to T.
   * @returns {Promise<KvRecord<T> | null>} KvRecord object describing the record of the KV store that has been set, alternatively returns null if key has been set to null.
   */
  set<T>(key: string, value: KvValue): Promise<KvRecord<T> | null>;

  /**
   * Retrieves the value for a specified key if it exists.
   * @param {string} key - The key to retrieve the value for.
   * @template T - Optional template to cast return objects value property from KvValue to T.
   * @returns {Promise<KvRecord<T> | null>} The KvRecord object describing the record corresponding to the given key if it exists in the table, else null.
   */
  get<T>(key: string): Promise<KvRecord<T> | null>;

  /**
   * Lists entries in the KV table based on prefix and other options.
   * @param {string} prefix - Allows for optional filtering by matching prefixes, set this to "" to include all keys.
   * @param {Partial<KvListOptions>} [options] - The options that pick the ordering, pagination, and whether to include exact prefix match.
   * @template T - Optional template to cast return objects value property from KvValue to T.
   * @returns {Promise<KvListOutput<T>>} KvListOutput object containing the array of KvRecord objects describing the query result, and a meta object describing the options that called the KvInterface.list, as well as the number of rows.
   */
  list<T>(
    prefix: string,
    options?: Partial<KvListOptions>,
  ): Promise<KvListOutput<T>>;

  /**
   * Deletes a specific key-value pair if it exists.
   * @param {string} key - Key for which removal of KV pair will occur, if it exists.
   * @returns {Promise<void>}
   */
  delete(key: string): Promise<void>;

  /**
   * Deletes all key-value pairs with keys beginning with prefix in the KV table. Should be used with extreme caution.
   * @param {string} [prefix] - All records with key starting with this string will be deleted. Not providing prefix will cause all delete ALL records.
   * @returns {Promise<void>}
   */
  deleteAll(prefix?: string): Promise<void>;

  /**
   * Executes a series of operations within a transaction, ensuring all or nothing execution.
   * @param {(tx: KvInterface) => Promise<T>} cb - The functionality to be run within the transaction.
   * @template T - Type of the return value of the user-defined callback function.
   * @returns {Promise<T>} Returns whatever is returned by the user-defined cb function.
   */
  transaction<T = unknown>(cb: (tx: KvInterface) => Promise<T>): Promise<T>;

  /**
   * Checks if the current operation is part of a transaction.
   * @returns {boolean}
   */
  isTransaction(): boolean;
};

/**
 * Describes KV query results obtained from methods such as `kv.get()` and `kv.list()`.
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
export type EventListener = (kvEvent: KvEvent) => Promise<void>;

/**
 * The optional object optionally containing readReplicaPath, syncInterval, and eventListener.
 *
 * @typedef {Object} OpenKVOptions
 * @property {string} [readReplicaPath] - The file path of the local read replica DB to be used for read operations.
 * @property {number} [syncInterval] - The number of seconds between each sync from the Turso DB to the local read replica.
 * @property {EventListener} [eventListener] - If provided, this function will be called when get and delete methods and will be supplied a KvEvent object detailing the changes to the KV.
 */
export type OpenKVOptions = {
  readReplicaPath?: string;
  syncInterval?: number;
  eventListener?: EventListener;
};

/**
 * Type of the internal buffer of the kv interface which queues KvEvents if set or delete called in a transaction.
 * If the transaction is committed, they are passed to the eventListener callback function.
 */
export type EventBuffer = Array<KvEvent>;

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
