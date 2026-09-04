# Atlas Storage v4 — dev closeout evidence — 2026-08-14

Scope: `atlasmap-dev` only. Production remained untouched.

## Result

The batched closeout runner completed with `pass: true` for block `pilot-migration-purge-phase-k-checkpoint`.

The runner is fail-fast, so reaching its final PASS means all preceding stages completed successfully:

1. real v3 -> v4 migration of the retained synthetic legacy trip;
2. real rollback of that fresh migration back to legacy;
3. real re-migration to v4, leaving the test trip in v4;
4. isolated real purge drill that created a due deleted-v4 fixture, recursively removed descendants, then removed root and purge job;
5. local resilience suite covering provider resilience, reconnect storm/capacity, multidevice simulation and multidevice contention;
6. consolidated Phase K cloud checkpoint.

The existing deleted pilot trip was evidence-only during this block and was not mutated by the migration/purge drill.

## Delete / lifecycle / purge

Whole-trip product semantics are now irreversible after confirmation:

- client confirmation triggers v4 lifecycle delete;
- root becomes `deleted` with incremented version;
- purge job is scheduled;
- no whole-trip restore action is accepted by the public lifecycle contract;
- physical purge happens asynchronously for operational safety.

Real evidence now covers both halves:

- client -> lifecycle soft delete: PASS;
- isolated recursive physical purge: PASS.

## Migration

Real dev round-trip evidence now exists:

```text
legacy v3
  -> migrate to v4
  -> verify complete/version 1
  -> rollback to legacy
  -> verify rolled-back
  -> re-migrate to v4
  -> verify complete/version 1
```

This closes the missing real-cloud proof for the migration/rollback machinery in dev. It does not authorize bulk migration or production migration.

## Phase K cloud checkpoint

Collected 2026-08-14.

### Recovery

- Firestore `(default)` location: `northamerica-south1`.
- PITR: enabled.
- PITR/version retention: 7 days (`604800s`).
- Scheduled backup: one daily schedule.
- Backup retention: 7 days.
- Three source backups were READY at checkpoint time.
- Existing temporary restore-drill database count: 0.
- Previous real restore drill and cleanup remain part of accumulated evidence.

### Billing / budget visibility

- Billing: enabled.
- Budget API: enabled/readable.
- Account-scope budget read: PASS.
- Single-project budget read: PASS.
- Budget count: 0.
- No budget was created or mutated.

A budget amount and thresholds remain an explicit product/operations decision and are not inferred by code.

### Telemetry / SLO sample

All four telemetry streams remain visible:

- `storage_v4_rollout_metric`;
- `storage_v4_sync_metric`;
- `storage_v4_provider_cache_metric`;
- `storage_v4_provider_request_metric`.

Current 7-day sample:

- rollout: 115 entries, 94 success / 21 error, p50 286 ms, p95 12,331 ms, p99 15,458 ms;
- sync: 17 entries, **5 real flush entries, 5/5 actionable success**, p50 154 ms, p95/p99 878 ms;
- provider cache: 7 misses, no read/write errors;
- provider request: 9 entries, 7 success / 2 network-error, p50 490 ms, p95/p99 5,545 ms.

The rollout/provider aggregate success percentages are not production SLO baselines because the same seven-day window includes deliberate failure injection, pilot debugging, kill-switch/config-unavailable tests and provider-outage probes. The sync flush sample is nevertheless valid evidence that the previously missing real flush signal now exists and succeeded 5/5 in this sample.

### Monitoring

- Atlas dashboards: exactly 1.
- Logs-based metrics: 7, all enabled.
- Atlas alert policies: 3, all still disabled.
- Notification channel: exactly 1 usable enabled email channel associated with all three policies.

Alert activation/testing remains separate because thresholds should be based on representative traffic rather than the deliberately noisy pilot/debug window.

## Phase J revalidation

Physical `atlas-cache` separation remains intentionally deferred. As of 2026-08-14, the official Firebase Admin Node reference still labels named-database `getFirestore(databaseId)` / `getFirestore(app, databaseId)` as Public Preview and explicitly says not to use that API in production.

Logical provider-cache separation, provider-safe persistence policy, TTL/freshness handling and fail-soft behavior remain implemented and tested. Do not force the physical named-database topology merely to close a checklist while the intended server-side Firebase Admin access path remains preview-only.

## Remaining material gaps after this closeout

The remaining work is now concentrated rather than architectural:

- approve/configure a project budget amount and thresholds;
- establish representative alert thresholds and test/enable the dev alert policies;
- add a representative real-cloud load/reconnect sample rather than only deterministic capacity simulation;
- obtain a true two-browser/two-device end-to-end concurrency sample if required before production rollout;
- feed measured/approved usage assumptions into the cost model;
- decide the Phase J physical-cache substitute/defer policy explicitly for production readiness;
- execute Phase L production rollout gates (L0-L7) only after the above operational decisions.

No production data, production project, production Rules or production rollout were changed by this closeout.
