# RouterKV: KV Store for Turso DB

RouterKV is a Key-Value (KV) wrapper designed for
[Turso DB](https://turso.tech/), a powerful database system. This library
provides a simple KV abstraction, allowing developers to leverage Turso
databases for scalable and efficient data storage without the complexities of
direct database management.

Built on top of libsql, RouterKV ensures robust performance and high
availability, with support for local read replicas that enhance read operations.
It is ideally suited for applications requiring a reliable key-value store
without the need for edge deployment.

## Key Features

- KV Abstraction: Interact with Turso DB using simple key-value operations.
- Local Read Replicas: Faster read speeds and improved application performance.
- Non-Edge Optimized: Perfect for application not operating on edge
  environments.

## Getting Started

To begin using RouterKV, ensure you have a Turso account and you have created a
database.

You can import RouterKV with the following steps:

```
import { openKV } from "..."
```
