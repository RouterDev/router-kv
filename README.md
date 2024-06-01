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
console.log("KV database opened");
```
