# RouterKV: TypeScript key-value wrapper for [libSQL](https://turso.tech/libsql).

This library provides a simple KV abstraction, allowing developers to leverage
[Turso](https://turso.tech/) databases for scalable and efficient data storage
without the complexities of direct database management.

## Key Features

- **Low Code Friendly**: Interact with a Turso DB using simple key-value
  operations.
- **Embedded Read Replicas**: Boost read times and improve application
  performance.
- **KV Events (Experimental)**: Create real-time applications.

## Installation

### Deno CLI and Deno Deploy

RouterKV is available on [JSR](https://jsr.io/@router/kv).

```ts
import { openKV } from "jsr:@router/kv";
```

## Usage

### Open a KV Store

Open a connection to your KV store using the openKV function. Provide the URL
and authentication token for your Turso database.

```ts
import { openKV } from "jsr:@router/kv";

const kv = await openKV("libsql://example.turso.io", "authToken");
```

### Set

Sets a key-value pair in the KV table.

```ts
await kv.set("scores:@gillmanseb", 42);
```

### Get

Retrieves the value for a specified key if it exists.

```ts
await kv.get("scores:@gillmanseb");
```

### List

Lists entries in the KV table based on prefix and other options.

```ts
await kv.list("scores:");
```

### Delete

Deletes a specific key-value pair if it exists.

```ts
await kv.delete("scores:@gillmanseb");
```

### Delete All

Deletes all key-value pairs with keys beginning with prefix in the KV table.

```ts
await kv.deleteAll("scores:");
```

### Transaction

Executes a series of operations within a transaction, ensuring all or nothing
execution.

```ts
async function claimBonus(user: string) {
  try {
    const bonusValue = 100;

    const score = await kv.transaction<number>(async (tx) => {
      // check if the user has claimed the bonus already
      const hasClaimedBonus = (await tx.get(
        `bonuses:${user}`,
      )) as KvQueryResult<number>;
      if (hasClaimedBonus) {
        throw new Error("Bonus already claimed!");
      }

      // get the users current score
      const usersScore = (await tx.get(
        `scores:${user}`,
      )) as KvQueryResult<number>;

      // calculate the users updated score
      const currentScore = usersScore?.v ?? 0;
      const updatedScore = currentScore + bonusValue;

      // update the users score
      await tx.set(`scores:${user}`, updatedScore);

      // mark the user as having claimed the bonus
      await tx.set(`bonuses:${user}`, true);

      // return the updated score
      return updatedScore;
    });

    console.log("Bonus applied!", `Your new score is ${score}`);
  } catch (error) {
    console.error(error.message);
  }
}
```

### Sync

Synchronizes the embedded KV read-replica with the remote database.

```ts
await kv.sync();
```

### Close

Closes the KV client and cleans up resources.

```ts
kv.close();
```
