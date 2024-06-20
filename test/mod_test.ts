import {
  testClose,
  testCreatedAtUpdatedAt,
  testDelete,
  testDeleteAll,
  testIncludeExactMatch,
  testListLimit,
  testListPagination,
  testListPrefix,
  testListReverse,
  testListSortColumn,
  testSet,
  testSetReturn,
  testTransaction,
  testTransactionWithdraw,
} from "./index.ts";

Deno.test("[delete all] records", async () => await testDeleteAll());

Deno.test("[set] string", async () => await testSet("test_string", "str"));

Deno.test("[set] number", async () => await testSet("test", 123));

Deno.test(
  "[set] returns same as [get]",
  async () => await testSetReturn("test", 123),
);

Deno.test(
  "[set] JSON object",
  async () => await testSet("test_json", { json: "object" }, true),
);

Deno.test(
  "[set] check null deletes the record",
  async () => await testSet("test_string", null),
);

Deno.test("[set] created_at constant", async () =>
  await testCreatedAtUpdatedAt());

Deno.test("[list] return single record", async () => await testListLimit(1));

Deno.test("[list] return no records", async () => await testListLimit(0));

Deno.test("[list] default limit", async () => await testListLimit());

Deno.test("[list] prefix", async () => await testListPrefix("testing:prefix"));

Deno.test("[list] pagination", async () => await testListPagination());

Deno.test("[list] reverse records", async () => await testListReverse());

Deno.test("[list] sort by columns", async () => await testListSortColumn());

Deno.test("[list] include exact match", async () =>
  await testIncludeExactMatch("test:exact:match"));

Deno.test("[delete] record", async () => await testDelete("testing:prefix"));

Deno.test(
  "[delete all] with prefix",
  async () => await testDeleteAll("testing"),
);

Deno.test("[delete all] no prefix", async () => await testDeleteAll());

Deno.test(
  "[transaction] simple",
  async () => await testTransaction("big", "moves"),
);

Deno.test(
  "[transaction] withdraw",
  async () => await testTransactionWithdraw(),
);

Deno.test("[close]", async () => await testClose());
