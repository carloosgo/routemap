# Atlas Storage v4 — Phase K sync flush E2E — 2026-08-12

Entorno: `atlasmap-dev`

Este checkpoint registra la prueba E2E real de un `sync flush` v4 controlado en desarrollo y el rollback posterior de las Firestore Rules temporales. No autoriza Storage v4 WRITE global, producción, budgets, alert policies ni migración.

## Alcance del probe

Se habilitó temporalmente un ruleset híbrido que conserva v3 y permite v4 WRITE únicamente para trips sintéticos con prefijo `phase-k-e2e-*`.

El probe de navegador:

- se ejecutó en `localhost` con sesión Firebase autenticada;
- usó la composición real `createV4WebSyncComposition`;
- limitó el flush a una sola mutación (`maxMutationsPerFlush=1`);
- creó un único root trip v4 sintético;
- verificó el documento remoto;
- vació la telemetría de sync;
- eliminó el trip sintético al terminar;
- limpió el IndexedDB aislado del probe;
- no cambió el flag global de Storage v4 WRITE;
- no tocó producción.

## Evidencia del sync flush — PASS

Trip sintético observado:

`phase-k-e2e-ed770677f11140c7aeed1d349ebf0e5a`

Resultado del probe:

- `syncFlushE2EPassed=true`;
- `synthetic=true`;
- `flush.leader=true`;
- `flush.attempted=1`;
- `flush.synced=1`;
- `flush.retried=0`;
- `flush.conflicts=0`;
- `flush.pending=0`;
- `remote.schemaVersion=4`;
- `remote.status=active`;
- `remote.version=1`;
- `telemetryFlushed=true`;
- `cleanupPassed=true`;
- `localProbeDataCleared=true`;
- `globalStorageV4WriteFlagChanged=false`;
- `productionUntouched=true`.

## Evidencia independiente en Cloud Logging

Preflight SLO read-only recogido el `2026-08-12T21:52:06.0704604Z`:

- `sync.entries=2`;
- `sync.flushEntries=1`;
- `sync.success=1`;
- `sync.unexpectedError=0`;
- `sync.notLeader=0`;
- `sync.actionableSuccessRatePercent=100`;
- `sync.durationMs.p50=137`;
- `sync.durationMs.p95=137`;
- `sync.durationMs.p99=137`.

Esta muestra demuestra que el evento `flush` real llegó a Cloud Logging. Una sola observación no constituye un SLO representativo ni productivo.

## Rollback de Rules — CLOSED / PASS

Ruleset original esperado:

- `projects/atlasmap-dev/rulesets/cd99a504-01c0-45dc-8875-cb9183d7698b`;
- SHA-256 del source: `bdc96219b4494c14b6e5346116e0363c46cf00c8f817c2e2936c25882f3823ab`.

Ruleset temporal usado durante la prueba:

- `projects/atlasmap-dev/rulesets/5630755d-d6e8-4f54-bb79-5f7ba341265e`;
- SHA-256 esperado: `be1da9e9e8c427d6f33b3102b097ad406275a86c55c83e687a88898790aa35d2`.

El state file local no estaba presente al ejecutar el primer `--rollback`, por lo que se usó el recovery endurecido con IDs y SHA exactos conocidos.

Resultado final de recovery:

- `recoveredRollback=true`;
- Cloud ya apuntaba al ruleset original;
- `restoredRulesetName=projects/atlasmap-dev/rulesets/cd99a504-01c0-45dc-8875-cb9183d7698b`;
- `restoredSourceSha256=bdc96219b4494c14b6e5346116e0363c46cf00c8f817c2e2936c25882f3823ab`;
- `temporaryRulesetAlreadyAbsent=true`;
- `scopedWriteRulesActive=false`;
- `applicationDataUntouchedByRecovery=true`;
- `globalStorageV4WriteFlagChanged=false`;
- `productionUntouched=true`.

Un preflight posterior confirmó nuevamente el ruleset original y `stateFilePresent=false`.

## Conclusión

**Sync Flush E2E de Phase K: CLOSED / PASS en `atlasmap-dev`.**

Queda probado el camino real navegador → IndexedDB/MutationQueue/SyncCoordinator → Firestore v4 → lectura remota → telemetría Cloud → cleanup, con una sola mutación sintética y rollback de Rules cerrado. Este PASS no sustituye multi-device E2E, load/reconnect E2E ni un baseline/SLO representativo.