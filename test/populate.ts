import { load } from "../dev_deps.ts";
import { openKV } from "../mod.ts";

await load({ export: true });

const url = Deno.env.get("KV_URL");
const authToken = Deno.env.get("KV_TOKEN");
const syncUrl = Deno.env.get("KV_SYNC_URL");

if (!url) throw new Error("No url");
if (!authToken) throw new Error("No authToken");

const kv = await openKV(url, authToken, { readReplicaPath: syncUrl });

type GithubRepoRecord = {
  id: number;
  forks_count: number;
  full_name: string;
};

const dummyData = await Deno.readTextFile("./test/github-repo-dataset.json");
const dummyJSON: GithubRepoRecord[] = JSON.parse(dummyData);

for (const record of dummyJSON) {
  const key = `repos_by_fork_count:${record.forks_count}:${record.id}`;
  await kv.set(key, record);
  await new Promise((resolve) => setTimeout(resolve, 100));
}
