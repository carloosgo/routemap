# Atlas Storage v4 — Phase L6 WRITE controlado

Fecha: **2026-08-14**

Target:

```text
project: atlasmap-prod
Firestore: (default)
location: us-central1
mode objetivo: pilot WRITE por cohorte
```

L6 es el primer gate donde una cohorte productiva puede escribir mediante la arquitectura v4. No cambia automáticamente v4 a fuente canónica global ni retira v3.

## Prerrequisitos duros

- L5 materialización/verificación PASS.
- Rules productivas de WRITE v4 generadas y probadas.
- backend productivo necesario desplegado y verificado de forma separada: sync, aggregate/touch, lifecycle y purge.
- Remote Config con kill-switch realtime comprobado.
- telemetría, métricas, alertas, recovery y budget operativos.
- comportamiento multidevice/conflictos muestreado con clientes reales o waiver explícito documentado.
- rollback a READ/v3 ejecutable antes de primera cohorte.

## Estado objetivo de una cohorte WRITE

```text
storage_v4_enabled=true
storage_v4_kill_switch=false
storage_v4_mode=pilot
storage_v4_cohort_percent=<porcentaje explícitamente aprobado>
storage_v4_read_rules_ready=true
storage_v4_write_rules_ready=true
storage_v4_sync_ready=true
storage_v4_aggregate_ready=true
storage_v4_touch_ready=true
storage_v4_lifecycle_ready=true
storage_v4_purge_ready=true
```

No existe porcentaje default.

## Rollback en dos niveles

### WRITE → READ

Ante degradación de escritura pero lectura v4 estable:

```text
storage_v4_mode=read
storage_v4_write_rules_ready=false
storage_v4_sync_ready=false
storage_v4_aggregate_ready=false
storage_v4_touch_ready=false
storage_v4_lifecycle_ready=false
storage_v4_purge_ready=false
```

READ se mantiene para evitar mezclar un rollback operacional con un cambio innecesario de lectura.

### Kill switch total

Ante riesgo de integridad o imposibilidad de confiar en el canal WRITE:

```text
storage_v4_enabled=false
storage_v4_kill_switch=true
storage_v4_mode=off
storage_v4_cohort_percent=0
```

## Métricas mínimas

Objetivos iniciales:

```text
cloud mutation normal connectivity >= 99.5% within 30s
repository unexpected-error-free >= 99.5%
silent data loss = 0
protected direct client v4 writes = 0
PII/trip telemetry = 0
```

Además observar:

- conflictos/rebase por entidad;
- lease/fencing y retries;
- backlog/flush del Sync Coordinator;
- aggregate drift;
- lifecycle delete→purge scheduled;
- latencia p50/p95 por mutación;
- tasa de rollback/reintento;
- discrepancias entre clientes concurrentes.

## Delete

La semántica de usuario permanece inalterada: Delete confirmado es definitivo para el usuario. L6 no agrega restauración pública de viajes. Recovery de infraestructura es un mecanismo distinto.

## Planner seguro

```bash
npm run phase-l:l6:write-plan-prod -- --cohort-percent=<valor>
```

Es **plan-only**. No despliega, no publica Remote Config, no activa WRITE y no admite `--apply`.

## Gate de salida L6

L6 puede cerrar cuando cohortes WRITE aprobadas mantengan integridad, conflictos deterministas, lifecycle/purge correcto, SLOs aceptables y rollback probado. Solo entonces L7 puede decidir cuándo v4 pasa a ser canónico y cuándo se retira v3.
