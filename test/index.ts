import { openKV } from "../mod.ts";
import type { Json, KvValue } from "../types.ts";
import { assert, assertEquals, fail, load } from "../dev_deps.ts";

await load({ export: true });

const DEFAULT_KV_LIST_OPTIONS_LIMIT = 100;

const url = Deno.env.get("KV_URL");
const embeddedReplicaPath = Deno.env.get("KV_EMBEDDED_REPLICA_PATH");
const authToken = Deno.env.get("KV_TOKEN");
const syncInterval = Deno.env.get("KV_SYNC_INTERVAL");

if (!url) {
  throw new Error("KV_URL missing");
}

if (!authToken) {
  throw new Error("KV_TOKEN missing");
}

const options = {
  embeddedReplicaPath: embeddedReplicaPath,
  syncInterval: syncInterval ? Number(syncInterval) : undefined,
};

const kv = await openKV(url, authToken, options);

export async function testSet(k: string, v: KvValue, isJSON: boolean = false) {
  await kv.set(k, v);
  const record = await kv.get(k);
  let res: boolean | void = false;
  if (isJSON) {
    res = assertEquals(true, JSON.stringify(v) == JSON.stringify(record?.v));
  } else if (v === null) {
    res = assertEquals(true, record === v);
  } else {
    res = assertEquals(true, record?.v === v);
  }
  return res;
}

export async function testSetReturn(k: string, v: KvValue) {
  const setRecord = await kv.set(k, v);
  const getRecord = await kv.get(k);
  assertEquals(setRecord, getRecord);
}

export async function testListLimit(
  limit: number = DEFAULT_KV_LIST_OPTIONS_LIMIT,
) {
  const record = await kv.list("", { limit });
  assert(record.data.length <= limit);
}

export async function testListPrefix(prefix: string) {
  await kv.set<number>(prefix + ":exists", 101);
  const record = await kv.list<number>(prefix);
  assert(record.data.length >= 1);
}

export async function testListPagination() {
  const pages = 2;
  const nRows = dummyData.length / pages;
  await clearAndCreateDummyData();

  const recordsPage1 = await kv.list("", {
    limit: nRows,
  });

  const recordsPage2 = await kv.list("", {
    limit: nRows,
    offset: nRows,
  });

  const allPages = await kv.list("", {
    limit: nRows * pages,
  });

  assertEquals(allPages.data, recordsPage1.data.concat(recordsPage2.data));
}

export async function testListReverse() {
  await clearAndCreateDummyData();
  const recordsAsc = await kv.list("", { orderBy: "k" });
  const recordsDesc = await kv.list("", { orderBy: "k", reverse: true });
  assertEquals(recordsAsc.data, recordsDesc.data.toReversed());
}

export async function testListSortColumn() {
  const recordsSortByK = await kv.list("", { orderBy: "k" });
  const recordsSortByV = await kv.list("", { orderBy: "created_at" });
  assert(recordsSortByK.data !== recordsSortByV.data);
}

export async function testIncludeExactMatch(key: string) {
  await kv.set(key, "exact match");
  await kv.set(key + ":abc", "prefix match");

  const exactIncluded = await kv.list(key, { includeExactMatch: true });
  const exactNotIncluded = await kv.list(key);

  assert(exactIncluded.data !== exactNotIncluded.data);
}

export async function testDelete(key: string) {
  await kv.delete(key);
  const records = await kv.get(key);
  assertEquals(records, null);
}

export async function testDeleteAll(prefix: string = "") {
  await kv.deleteAll(prefix);
  const records = await kv.list(prefix);
  assertEquals(records.data.length, 0);
}

export async function testTransaction(k: string, v: string) {
  const txRecord = await kv.transaction(async (tx) => {
    return await tx.set(k, v);
  });
  const record = await kv.get(k);
  await kv.delete(k);
  assertEquals(txRecord?.v, record?.v);
  assertEquals(txRecord?.v, v);
}

export async function testTransactionWithdraw() {
  const testCases = [
    { balance: 100, amount: 50, expected: 50 },
    { balance: 100, amount: 100, expected: 0 },
    { balance: 100, amount: 101, expected: 100 },
  ];

  for (const { balance, amount, expected } of testCases) {
    try {
      await kv.set<number>("balance", balance);
      const record = await kv.transaction(async (tx) => {
        const kvBalanceQuery = await tx.get<number>("balance");

        if (!kvBalanceQuery) {
          throw new Error("Account does not exist.");
        }

        if (kvBalanceQuery.v < amount) {
          throw new Error("Balance insufficient for withdrawal.");
        }

        const newBalance = kvBalanceQuery.v - amount;
        return await tx.set<number>("balance", newBalance);
      });

      assertEquals(record?.v, expected);
    } catch (error) {
      const record = await kv.get<number>("balance");
      assertEquals(record?.v, expected, error.message);
    }
  }
}

export async function testClose() {
  kv.close();
  try {
    await kv.set<string>("should", "error");
    fail("Expected KVError to be thrown, but it was not.");
  } catch (error) {
    assertEquals(error.name, "KVError");
  }
}

const dummyData = [
  {
    _id: "4edb95a2-902b-4fe5-91b5-9e8c63959b12",
    age: 88,
    firstName: "Angelo",
    lastName: "Schaden",
    email: "Angelo_Schaden@yahoo.com",
    isTrue: false,
  },
  {
    _id: "3321f654-b796-4d08-b90c-e2e71d742a4d",
    age: 44,
    firstName: "Rosetta",
    lastName: "Hyatt",
    email: "Rosetta.Hyatt88@yahoo.com",
    isTrue: true,
  },
  {
    _id: "e0b580f5-9820-41e8-b3d2-f76a9257f859",
    age: 64,
    firstName: "Keon",
    lastName: "Spencer",
    email: "Keon.Spencer92@gmail.com",
    isTrue: true,
  },
  {
    _id: "cfad05a6-9358-4b5b-ac4e-1a7b9050d3ae",
    age: 53,
    firstName: "Mariana",
    lastName: "Emmerich",
    email: "Mariana.Emmerich@gmail.com",
    isTrue: false,
  },
  {
    _id: "77879e3b-4896-490d-b5c6-fdd29d992711",
    age: 54,
    firstName: "Georgette",
    lastName: "Daniel",
    email: "Georgette.Daniel64@gmail.com",
    isTrue: true,
  },
  {
    _id: "3f8c39c4-8f7e-451d-9ecb-ba36434b3a8a",
    age: 44,
    firstName: "Ray",
    lastName: "Romaguera",
    email: "Ray.Romaguera@hotmail.com",
    isTrue: true,
  },
  {
    _id: "2aa3f432-69e1-436b-b6fc-ba229483df39",
    age: 13,
    firstName: "Hailee",
    lastName: "Pagac",
    email: "Hailee_Pagac@hotmail.com",
    isTrue: false,
  },
  {
    _id: "09ecbf2a-8bf5-4bcf-8c7d-7e040529e039",
    age: 60,
    firstName: "Jessica",
    lastName: "Marvin",
    email: "Jessica_Marvin@gmail.com",
    isTrue: false,
  },
  {
    _id: "6e7bfc02-208b-463d-8682-323c2f32563c",
    age: 42,
    firstName: "Merle",
    lastName: "Gulgowski",
    email: "Merle.Gulgowski@yahoo.com",
    isTrue: true,
  },
  {
    _id: "40d24ff7-209e-498a-a7fa-4e2e913af6a0",
    age: 79,
    firstName: "Claudia",
    lastName: "Bogan",
    email: "Claudia.Bogan82@gmail.com",
    isTrue: false,
  },
  {
    _id: "e82321aa-e6ba-4eb2-b7f8-59d71a8fa0b8",
    age: 87,
    firstName: "Meagan",
    lastName: "Hudson",
    email: "Meagan.Hudson@yahoo.com",
    isTrue: true,
  },
  {
    _id: "86c93155-3263-4a49-adc9-293c10eabbb1",
    age: 10,
    firstName: "Kenyon",
    lastName: "Kreiger",
    email: "Kenyon.Kreiger@hotmail.com",
    isTrue: false,
  },
  {
    _id: "18830c0e-7b73-45e0-a51e-45a7d69d30d1",
    age: 21,
    firstName: "Bernardo",
    lastName: "Zulauf",
    email: "Bernardo_Zulauf@gmail.com",
    isTrue: true,
  },
  {
    _id: "6f26b46c-45a6-49e1-95a7-ad794e703eec",
    age: 19,
    firstName: "Ulices",
    lastName: "Collins",
    email: "Ulices.Collins@gmail.com",
    isTrue: true,
  },
];

export async function clearAndCreateDummyData() {
  await testDeleteAll();
  for (const record of dummyData) {
    await kv.set<Json>(`user:${record._id}`, record);
  }
}
