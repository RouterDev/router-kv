import type { Value } from "./deps.ts";
/** Type encompassing all non BLOB types that can be stored as values in kv table. */
export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[];

/** Type encompassing all possible types that can be stored in kv table as a value. */
export type KvValue = Value | Json;

/**
 * This type describes the parameters used for pagination and ordering in `KvInterface.list()`.
 * @prop `[limit]` The maximum number of results to be obtained. Defaults to 100.
 * @prop `[offset]` The number of rows to skip. Defaults to 0.
 * @prop `[reverse]` Set to true to `reverse` the ordering of results. Defaults to `false`.
 * @prop `[orderBy]` Column of the KV table to order results by. Can be `"k", "v", "created_at"`, or `"updated_at"`. Defaults to `"k"`.
 * @prop `[includeExactMatch]` Set to true to include exact matches with `KvInterface.list()` parameter `prefix`. Defaults to `false`.
 */
export type KvListOptions = {
  limit: number;
  offset: number;
  reverse: boolean;
  orderBy: keyof KvRecord;
  includeExactMatch: boolean;
};

/**  Interface describing Metadata object containing the `limit`, `offset`, `reverse`, `orderBy`, and `includeExactMatch`
 * of a `KvInterface.list()` operation, as well as `total` - the number of KV entries, to be returned as the `meta` property of that operations return value. */
export interface KvMetaData extends KvListOptions {
  total: number;
}

/**  Type describing the output of `KvInterface.list()`
 * @prop data: The query result in the form of an array of objects representing each row.
 * @prop meta: Metadata object containing the `limit`, `offset`, `reverse`, `orderBy`, and `total` of the `KvInterface.list()` operation that returned this `KvListOutput`.
 */
export type KvListOutput<T> = {
  data: KvRecord<T>[];
  meta: KvMetaData;
};

/**  Type describing the output of openKV().
 * Represents the collection of methods contained by the main kv client to be exported.
 * @method sync: Method to sync the local kv read-replica table with the cloud-based table.
 * @method close: Method to close the kv client.
 * @method set: Method used to set key-value pairs in the kv table.
 * @method get: Method used to get the value of a key in the kv table, if it exists.
 * @method list: Method used to perform listing and filtering on the kv table.
 * @method delete: Method used to delete key-value pairs in the kv table if they exist.
 * @method deleteAll: Method used to delete all key-value pairs with keys beginning with prefix in the kv table.
 * @method transaction: Method used to securely perform a series of KV operations whilst ensuring consistency.
 * @method isTransaction: Method used to check if current kv instance is within a transaction or not.
 * @method getEventBuffer: Method for accessing the event buffer property used for storing KvEvents whilst in a transaction for passing to the eventListener callback function upon transaction commit.
 */
export type KvInterface = {
  /** Method for accessing the event buffer property used for storing KvEvents whilst in a transaction for passing to the eventListener callback function upon transaction commit. */
  get getEventBuffer(): Array<KvEvent>;

  /**  Method to manually sync the local kv read-replica table with the cloud-based table  */
  sync(): Promise<void>;

  /**  Method to close the kv client */
  close(): void;

  /**  Method used to set key-value pairs in the kv table
   * @param {string} key - The key to have it's value set/updated
   * @param {KvValue} value - The value that will be set
   * @template T - Optional template to cast return objects value property from KvValue to T
   * @returns {Promise<KvRecord<T> | null>} KvRecord object describing the record of the KV store that has been set, alternatively returns null if key has been set to null.
   */
  set<T>(key: string, value: KvValue): Promise<KvRecord<T> | null>;

  /**  Method used to get the record corresponding to a key in the kv table, if it exists
   * @param key - The key to have it's value returned
   * @template T - Optional template to cast return objects value property from KvValue to T
   * @returns {KvRecord<T>|null} The KvRecord object describing the record corresponding to the given key if it exists in the table, else null
   */
  get<T>(key: string): Promise<KvRecord<T> | null>;

  /**  Method used to perform listing and filtering on the kv table.
   * @param {string} prefix - Allows for optional filtering by matching prefixes, set this to "" to include all keys.
   * @param {Partial<KvListOptions>} options - The bag of options that pick the ordering, pagination, whether to include exact prefix match, and eventListener function.
   * @template T - Optional template to cast return objects value property from KvValue to T
   * @returns KvListOutput object containing the array of KvRecord objects describing the query result, and a meta object describing the options that called the KvInterface.list, as well as the number of rows.
   */
  list<T>(
    prefix: string,
    options?: Partial<KvListOptions>,
  ): Promise<KvListOutput<T>>;

  /**  Method used to delete key-value pairs in the kv table if they exist
   * @param key - Key for which removal of KV pair will occur, if it exists.
   */
  delete(key: string): Promise<void>;

  /**  Method used to delete all key-value pairs with keys beginning with prefix in the kv table. Should be used with extreme caution.
   * @param [prefix] - All records with key starting with this string will be deleted. Not providing prefix will cause all delete ALL records.
   */
  deleteAll(prefix?: string): Promise<void>;

  /**  Method used to perform a series of KV operations whilst ensuring consistency.
   * Any errors in the transaction lead to a full rollback of any operations performed
   * on the kv within the transaction.
   *
   * @param cb - The functionality to be run within the transaction, all KV operations within this callback (applied to tx) will be rolledback if an error is thrown.
   * @returns Returns whatever is returned by the user-defined cb function
   */
  transaction<T = unknown>(cb: (tx: KvInterface) => Promise<T>): Promise<T>;

  /**  Method used to check if current kv instance is within a transaction or not.  */
  isTransaction(): boolean;
};

/**
 * Type describing KV query results obtained from methods such as `kv.get()` and `kv.list()`.
 * @template T - Type of the value column in the KV query result.
 * @prop k - Key column of the KV query result.
 * @prop v - Value column of the KV query result.
 * @prop created_at - `created_at` column of the KV query result.
 * @prop updated_at - `updated_at` column of the KV query result.
 */
export type KvRecord<T = KvValue> = {
  k: string;
  v: T;
  created_at: string;
  updated_at: string;
};

/** Type returned by KV query commands such as get, set, and list(as part of KvListOutput).
 * Casts value field to string.  */
export type KvQueryResult = KvRecord<string>;

/** User provided callback function to be executed on KvEvent objects.
 * Triggered upon set and delete executions.
 *
 * @param kvEvent: Object passed by set or delete executions. Gives context on what method called the eventListener, and contains the updated rows. */
export type EventListener = (kvEvent: KvEvent) => Promise<void>;

/**
 * The optional object optionally containing readReplicaPath, syncInterval, and eventListener
 * @prop readReplicaPath - The file path of the local read replica DB to be used for read operations.
 * @prop syncInterval - The number of seconds between each sync from the Turso DB to the local read replica.
 * @prop eventListener - If provided, this function will be called when get and delete methods and will be supplied a KvEvent object detailing the changes to the KV.
 */
export type OpenKVOptions = {
  readReplicaPath?: string;
  syncInterval?: number;
  eventListener?: EventListener;
};

/** Type of the internal buffer of the kv interface which queues KvEvents if set or delete called in a transaction. If transaction is committed they are  */
export type EventBuffer = Array<KvEvent>;

/** The type of the object that is given to the user-provided eventListener function.
 *
 * @param type - String stating what KV method has caused the KvEvent. (Either `"set"` or `"get"`)
 * @param data - KvRecord object reflecting the KV record that has been added/updated/deleted.
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
