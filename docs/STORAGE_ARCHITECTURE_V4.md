# Atlas Storage Architecture v4

Status: **controlled pilot in `atlasmap-dev`; not active in production**

This document defines the target persistence architecture for Atlas. v4 may be exercised only through explicitly approved rollout gates until production readiness is complete.

## 1. Non-negotiable invariants

1. A user can never read or mutate another user's trip data.
2. UI changes are local-first and never wait for the network to render.
3. A keystroke is never a Firestore write boundary.
4. A logical entity is the normal remote write boundary.
5. A change to one entity must not rewrite the whole trip.
6. Unsynced user work must survive refresh/crash whenever the platform supports durable local storage.
7. No silent overwrite is allowed when the same entity has advanced remotely.
8. Server-derived aggregates are not client-authoritative.
9. Provider cache data is never client-writable and is not mixed with canonical user data.
10. Whole-trip deletion is irreversible for the user once confirmed; physical purge may happen later for operational safety.
11. Background work must be idempotent because Firestore triggers are at-least-once and unordered.
12. Every migration is resumable and rollback-safe.
13. v3 and v4 must not be dual-written indefinitely.
14. Web, iOS and Android share the same synchronization semantics; storage adapters may differ.
15. v4 cannot be enabled merely because code compiles: emulator rules, unit tests, integration tests, migration verification and load gates must pass.

## 2. Canonical Firestore shape

Canonical user data stays isolated below the authenticated UID.

```text
users/{uid}/trips/{tripId}
  segments/{segmentId}
  places/{placeId}
  connections/{connectionId}
  notes/{noteId}
  checklist/{itemId}
```

The trip root is a small summary/materialized view, not a container for the full trip.

### Trip root

Target fields:

```text
id
name
currency
schemaVersion = 4
status = active | deleted | purging
createdAt        server timestamp
updatedAt        server timestamp
deletedAt        server timestamp | null
purgeAfter       timestamp | null
segmentCount     server-owned
placeCount       server-owned
total            server-owned
```

Only summary fields required by actual product queries should be retained. `noteCount`, `checklistCount` and similar fields are omitted unless a concrete UI/query requirement justifies them.

### Segment

A segment is one logical write unit. Cities, dates, expenses and the segment note stay together.

```text
id
rank
origin
destination
startDate
endDate
expenses
note
status = active | deleted
version
createdAt
updatedAt
deletedAt
```

Expenses are not split into one document per field by default.

### Place

```text
id
rank
provider
googlePlaceId
userLabel
persistable provider-safe fields
status
version
createdAt
updatedAt
deletedAt
```

Google/Geoapify provider restrictions remain authoritative. Dynamic enrichment/cache data does not become canonical trip data merely because v4 exists.

### Connection

The canonical connection stores user intent, not volatile provider output.

```text
id
rank
fromPlaceId
toPlaceId
mode
visible
status
version
createdAt
updatedAt
deletedAt
```

Route geometry, ETA, traffic, schedules and raw provider payloads belong in cache/derived layers according to provider policy and TTL rules.

### Note

```text
id
rank
title
text
status
version
createdAt
updatedAt
deletedAt
```

### Checklist item

```text
id
rank
text
done
status
version
createdAt
updatedAt
deletedAt
```

## 3. Entity versions and optimistic concurrency

Every mutable entity has an integer `version`.

Creation starts at version 1. A valid normal update advances exactly one version:

```text
server version 17
client baseVersion 17
proposed version 18 -> allowed
```

A stale mutation is rejected:

```text
server version 18
client baseVersion 17
proposed version 18 -> rejected
```

Security Rules must enforce valid version advancement and prevent ownership/immutable-field mutation. The happy path must not require a client transaction before every write.

When a stale write is rejected, Sync Coordinator fetches the latest entity and enters conflict resolution. v4.0 does **not** silently use last-write-wins for canonical user entities.

Initial conflict policy:

- different entity IDs: independent; both survive;
- same entity with same current version: normal write;
- same entity with advanced server version: preserve both local and server values and mark conflict;
- no generic field-level three-way merge in v4.0 until separately specified and tested.

This deliberately prefers deterministic safety over clever automatic merging.

## 4. Local-first persistence contract

The synchronization engine must depend on a platform-neutral persistence contract, not directly on IndexedDB.

Conceptual components:

```text
DraftRepository
LocalEntityStore
MutationQueue
SyncCoordinator
NetworkState
CrossContextCoordinator (web only)
```

Platform adapters:

- Web: IndexedDB-backed implementation.
- iOS/Android: durable native adapter appropriate to the chosen mobile stack.

Firestore SDK cache may be used for cached reads, but Atlas's mutation queue remains authoritative for pending canonical writes because Atlas requires explicit version-conflict semantics rather than blind last-write-wins.

### Local entity record

Conceptual shape:

```text
userId
tripId
entityType
entityId
payload
serverVersion
localRevision
state = clean | dirty | syncing | conflict | error
lastModifiedLocal
```

### Mutation record

Conceptual shape:

```text
mutationId
userId
tripId
entityType
entityId
operation = create | update | delete | restore
baseVersion
payload
createdAtLocal
attempts
nextAttemptAt
```

`restore` in the generic mutation vocabulary is reserved for entity/tombstone synchronization where explicitly allowed. It is not a supported whole-trip user action.

Multiple pending mutations for the same entity should be coalesced before remote sync where semantically safe. The earliest relevant `baseVersion` is preserved and the newest intended payload wins inside that coalesced local mutation.

## 5. Sync Coordinator

The coordinator serializes writes per entity, not globally for the whole application.

Normal sequence:

```text
React update (immediate)
  -> durable local draft
  -> entity marked dirty
  -> debounce/coalesce
  -> remote write
  -> server confirmation
  -> local entity marked clean
```

Remote flush signals include:

- editing pause;
- leaving/collapsing an edited logical unit;
- switching module/trip;
- application/background visibility transition;
- explicit "save now";
- maximum dirty age safeguard.

The exact debounce values are configuration, not schema invariants, and must be tuned from measurements.

### Retry policy

Retries use capped exponential backoff with jitter. No tight loops.

Initial policy target:

```text
~1s, 2s, 4s, 8s, 16s, then capped around 30s, each with jitter
```

After repeated failure the mutation remains durable and visible as pending. Reconnection/foreground/user retry can resume it. Recovery from a broad outage must jitter clients to prevent a reconnection storm.

## 6. Multiple browser tabs

Web must have an explicit Cross-Context Coordinator.

Requirements:

1. drafts/mutation queue are shared durable state;
2. tabs notify one another of relevant local changes;
3. only one sync leader per browser profile/origin normally drains remote mutations;
4. leadership uses a renewable lease with expiry;
5. a crashed/closed leader can be replaced;
6. duplicate execution must still be harmless because remote writes remain version-checked/idempotent;
7. no tab may erase another tab's newer local mutation during cleanup.

`BroadcastChannel` is an acceptable notification primitive where supported, but correctness must not depend solely on ephemeral messages; durable state/lease is authoritative.

Firestore's own multi-tab persistent cache is complementary, not a replacement for Atlas's queue coordination.

## 7. Ordering

Ordering uses opaque lexicographically sortable rank strings, not floating-point gaps.

Requirements:

- insertion between neighbors normally updates only the moved/new entity;
- ranks must be deterministic and comparable as strings;
- rank generation must be covered by property/edge tests before activation;
- rank growth has a documented threshold;
- rebalance is asynchronous and does not block UI;
- rebalance must be resumable/idempotent;
- no floating-point `< 1e-6` style rank policy.

The concrete rank algorithm/library is an implementation decision that must be proven separately; it is intentionally not improvised in this document.

## 8. Server-owned aggregates

The trip summary is a materialized view. Canonical entities are the source of truth.

Initial aggregates:

- `segmentCount`;
- `placeCount`;
- `total`.

Only entities that affect an aggregate should trigger aggregate work.

Firestore-triggered processing must be idempotent and tolerate out-of-order delivery. A duplicated event cannot double increment/decrement totals.

Logical transition table for an aggregate-bearing entity:

| Before | After | Count delta | Value delta |
| --- | --- | ---: | ---: |
| missing | active | +1 | +new |
| active | active | 0 | new - old |
| active | deleted | -1 | -old |
| deleted | active | +1 | +new |
| deleted | deleted | 0 | 0 |
| deleted | physically purged | 0 | 0 |

Physical purge never applies an aggregate decrement already applied by the soft-delete transition.

No distributed counter or backend queue is introduced by default. First measure actual contention per trip. Escalation order:

1. direct idempotent summary updates;
2. if metrics prove contention: serialize/coalesce aggregate work per trip;
3. shard only if measured workload still requires it.

## 9. Delete and purge

### Whole trip

Once the user confirms deletion, Atlas treats the trip as permanently deleted from the product perspective:

```text
status = deleted
deletedAt = server timestamp
purgeAfter = server timestamp + operational retention
```

There is no user-facing trash and no whole-trip restore API. The trip disappears from normal queries immediately and cannot be reactivated by the client or lifecycle callable.

The retention window exists only so the backend can perform physical cleanup safely and resumably; it is not a recovery window exposed to the user. The current development target is 30 days and remains configurable before production.

A server purge process performs recursive physical deletion later. Parent/tombstone removal happens last.

Purge state is resumable:

```text
deleted -> purging -> purged/removed
```

A scheduled reconciliation job retries stale `purging` records. Partial recursive deletion is therefore operationally recoverable by the backend without making the trip restorable to the user.

### Child entity

Child deletion creates a tombstone by changing `status` to `deleted` and advancing `version`. This prevents an offline stale device from silently resurrecting an entity. Tombstones may be physically purged after their retention window, once conflict/recovery requirements allow it.

## 10. Provider cache isolation

Target production topology:

```text
(default)    canonical user data
atlas-cache  provider/derived cache
```

`atlas-cache` is a named Firestore database in the same Firebase project initially.

Client policy:

```text
read  deny
write deny
```

Server IAM/Functions access cache explicitly. Each database has independent rules/index configuration.

Moving cache to another project is not part of v4.0 unless measured operational requirements justify the additional IAM/deployment complexity.

TTL is data-type-specific and validity is checked in application code with `expiresAt`; Firestore TTL deletion is cleanup, not the source of truth for freshness.

## 11. Security Rules contract

Rules remain owner-path based:

```text
request.auth.uid == userId
```

v4 rules must also enforce:

- exact allowed fields (`hasOnly`/strict validation);
- field types and size bounds;
- immutable `createdAt`/ownership identity;
- server-owned aggregate fields cannot be forged by clients;
- entity updates advance `version` exactly once;
- clients cannot mutate canonical data inside deleted/purging whole trips;
- provider/internal cache collections are inaccessible to clients;
- cross-user access is denied at every nesting level.

Every rule change is tested with Firestore Emulator, including negative cases.

## 12. Migration v3 -> v4

Migration is incremental and two-phase.

### Read compatibility

During rollout, application code may read v3 and v4.

### Write policy

- new trips created after v4 activation: v4 only;
- unmigrated existing trips: v3 remains canonical until migration commits;
- migrated trips: v4 only;
- no long-lived dual-write.

### Two-phase migration

```text
v3 canonical
 -> migrationState=migrating
 -> materialize v4 entities
 -> verify counts/IDs/totals/content invariants
 -> atomic/small commit marks schemaVersion=4 + migration complete
```

Before the final commit, v3 remains authoritative. Partial v4 materialization can be safely retried or cleaned.

The source v3 revision used for migration is retained for a safety window before cleanup. Existing v3 revision cleanup behavior means v3 is not treated as a complete historical version system.

## 13. Production infrastructure

Current development Firestore is regional `northamerica-south1`; current Gen 2 Functions are in `us-central1`. Production location is chosen before production database creation.

Production must use a distinct Firebase project. Database and Firestore-heavy Functions should be regionally aligned as closely as the selected topology permits.

App Check is enabled gradually: observe first, then enforce with documented rollback.

## 14. Backups and recovery

Before production launch:

- configure PITR where selected/available;
- configure scheduled backups;
- document retention;
- execute a real restore drill into a separate database;
- verify application-level hydration/consistency after restore.

"Backup enabled" is not considered validated until a restore drill passes.

## 15. Monitoring/SLO inputs

Minimum client sync metrics:

```text
pending mutations
oldest pending mutation age
sync latency p50/p95/p99
retry count
sync errors
version conflicts
offline queue age
sessions ending with pending mutations
```

Minimum Firestore/backend metrics:

```text
reads/writes/deletes
write latency/contention errors
Function invocation/error/duration
aggregate processing lag
duplicate event processing
purge backlog/cache hit ratio/provider 429/5xx
```

Budgets and automated alerts are required before production. Budget alerts do not replace runtime rate limits or anomaly alerts.

## 16. Rollout gates

### Gate A — contract and pure models

- architecture document approved;
- version/transition/coalescing/backoff pure models tested;
- no runtime activation.

### Gate B — local persistence foundation

- platform-neutral interfaces;
- IndexedDB web adapter;
- crash/reload recovery tests;
- multi-tab leader/lease tests;
- still no v4 remote writes for normal users.

### Gate C — v4 Firestore schema/rules/repository

- v4 root/entity rules;
- emulator negative/positive suite;
- incremental repository integration tests;
- version-conflict tests;
- provider persistence-policy tests.

### Gate D — Sync Coordinator

- dirty tracking/coalescing;
- retry+jitter;
- conflict state;
- background/foreground flush;
- network failure tests.

### Gate E — aggregates and delete lifecycle

- idempotent aggregate processing;
- duplicate/out-of-order event tests;
- irreversible whole-trip soft delete;
- purge/reconciliation;
- failure injection.

### Gate F — migration

- deterministic v3->v4 materialization;
- verification checks;
- resumability/rollback;
- fixture migration tests.

### Gate G — controlled rollout

- feature flag/cohort rollout;
- v3/v4 comparative telemetry;
- staged traffic increase;
- load and reconnection-storm tests;
- no broad activation until SLO/error/cost gates pass.

### Gate H — production readiness

- production project/location finalized;
- cache topology finalized;
- App Check enforcement proven;
- backup + restore drill passed;
- budget/operational alerts enabled;
- rollback runbook tested.

## 17. Explicitly out of scope for first implementation

These are not silently assumed:

- collaborative real-time editing;
- generic automatic field-level three-way merge;
- distributed counters from day one;
- a custom event bus before metrics justify it;
- moving provider cache to a separate GCP/Firebase project;
- treating old v3 revisions as a complete user-facing history system.

They may be added later behind separate architecture decisions and tests.

## 18. References used for implementation decisions

Official Firebase documentation must be rechecked during each implementation phase because SDK/platform behavior changes over time:

- Firestore offline persistence and multi-tab cache: https://firebase.google.com/docs/firestore/manage-data/enable-offline
- Transactions/batches and offline transaction behavior: https://firebase.google.com/docs/firestore/manage-data/transactions
- Firestore-trigger delivery ordering/at-least-once: https://firebase.google.com/docs/functions/firestore-events
- Security Rules field validation/diff: https://firebase.google.com/docs/firestore/security/rules-fields
