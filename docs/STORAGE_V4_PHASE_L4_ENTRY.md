# Atlas Storage v4 — Phase L4 READ productivo

Fecha: **2026-08-14**

Target:

```text
project: atlasmap-prod
Firestore: (default)
location: us-central1
mode objetivo: READ gradual
```

L4 no autoriza WRITE v4, migración masiva ni canonicalización. Su objetivo es abrir lectura híbrida v2/v3/v4 a una cohorte productiva controlada y medir comportamiento real con rollback inmediato.

## Prerrequisitos duros

L4 no inicia hasta que:

1. L2 recovery/costo esté PASS: PITR, backup diario, restore drill aislado, budget y forecast aprobado.
2. L3 App Check esté al menos en observación productiva con cliente enviando tokens y métricas interpretables.
3. El ruleset READ se genere desde la fuente autorizada y pase Emulator/CI.
4. Remote Config productivo exista en estado fail-closed y su canal realtime haya sido comprobado.
5. La telemetría de rollout esté desplegada/verificada sin PII ni contenido de viaje.
6. El rollback esté ensayado antes de la primera cohorte.

## Estado local y remoto esperado antes de activar

La build productiva debe permanecer localmente fail-closed. Remote Config es la autoridad operacional del rollout.

Antes de primera cohorte:

```text
storage_v4_enabled=false
storage_v4_kill_switch=true
storage_v4_mode=off
storage_v4_cohort_percent=0
storage_v4_read_rules_ready=false
storage_v4_write_rules_ready=false
storage_v4_sync_ready=false
storage_v4_aggregate_ready=false
storage_v4_touch_ready=false
storage_v4_lifecycle_ready=false
storage_v4_purge_ready=false
```

## Activación READ

Una cohorte L4 aprobada usa únicamente:

```text
storage_v4_enabled=true
storage_v4_kill_switch=false
storage_v4_mode=read
storage_v4_cohort_percent=<porcentaje explícitamente aprobado>
storage_v4_read_rules_ready=true
```

Todos los flags de WRITE/lifecycle/sync permanecen `false`.

No existe porcentaje default en código ni documentación. El porcentaje se decide a partir de evidencia y se pasa explícitamente al planner `phase-l:l4:read-plan-prod`.

## Métricas mínimas de aceptación

Comparar por modo/cohorte:

- tasa de éxito/error por operación;
- `permission-denied` y errores de Rules;
- latencia p50/p95 de lectura/listado;
- mix agregado de schemas encontrados;
- schemas desconocidos;
- viajes ausentes o inconsistencias entre repositorio v3 e híbrido;
- reintentos/backoff/reconexión anómalos;
- cualquier señal de escritura v4 directa desde cliente.

Objetivos iniciales del runbook general siguen vigentes:

```text
trip read >= 99.9%
repository unexpected-error-free >= 99.5%
silent data loss = 0
protected direct client v4 writes = 0
PII/trip telemetry = 0
```

El stress dev no sustituye esta evidencia productiva.

## Rollback inmediato

Primer rollback:

```text
storage_v4_enabled=false
storage_v4_kill_switch=true
storage_v4_mode=off
storage_v4_cohort_percent=0
storage_v4_read_rules_ready=false
```

Primero se confirma que el cliente regresó a v3. Solo después, si es necesario, se considera rollback de Rules. No restaurar Rules v3 mientras una build READ activa pueda seguir intentando leer v4.

## Condiciones de parada

Detener expansión ante cualquiera de estas señales:

- aumento material de `permission-denied`;
- desaparición de viajes del listado;
- discrepancia entre lectura v3 e híbrida;
- schema inesperado;
- error de aislamiento entre usuarios;
- degradación material de latencia/errores;
- escritura v4 directa desde cliente;
- PII/contenido de viaje en telemetría;
- canal realtime de Remote Config no disponible para rollback.

## Runner de preparación

```bash
npm run phase-l:l4:read-plan-prod -- --cohort-percent=<valor>
```

El runner es **plan-only**:

- no acepta `--apply`;
- no muta cloud;
- no despliega Rules;
- no publica Remote Config;
- no habilita READ/WRITE;
- exige porcentaje explícito.

Su función es congelar el contrato de la cohorte antes de cualquier mutación remota.

## Gate de salida L4

L4 se considera estable cuando una cohorte productiva aprobada demuestra lectura híbrida sin pérdida silenciosa, sin escrituras v4 directas, dentro de los objetivos acordados y con rollback funcional. La expansión de cohortes puede ocurrir en varios pasos; llegar a 100% READ no autoriza automáticamente L5 ni L6.
