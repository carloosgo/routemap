# Atlas Storage v4 — Phase K evidence — 2026-08-11

Entorno: `atlasmap-dev`

Este documento registra evidencia observada del entorno. No autoriza producción ni cambia configuración cloud por sí mismo.

## Preflight Firestore / billing

### Baseline antes de recovery

Evidencia capturada a las `2026-08-11T21:25:07Z`:

- database: `(default)`;
- location: `northamerica-south1`;
- billing: habilitado;
- PITR: `POINT_IN_TIME_RECOVERY_DISABLED`;
- retention de versiones: `3600s`;
- backup schedule probe: `ok`;
- backup schedules: `0`.

### Evidencia después de recovery dev

Evidencia capturada a las `2026-08-11T21:51:49Z` y reconfirmada a las `2026-08-11T23:16:24Z`:

- database: `(default)`;
- location: `northamerica-south1`;
- billing: habilitado;
- PITR: `POINT_IN_TIME_RECOVERY_ENABLED`;
- retention de versiones: `604800s` (7 días);
- earliest version time observado: `2026-08-11T20:52:00Z`;
- delete protection: `DELETE_PROTECTION_DISABLED`;
- backup schedule probe: `ok` vía `gcloud`;
- backup schedules: `1`;
- scheduled backup creado: `2026-08-11T21:51:35.104231Z`;
- recurrencia: diaria;
- retención del backup: `604800s` (7 días);
- budget probe: `unavailable`;
- budget probe source: `billing-rest-project-scope`;
- budget probe HTTP status: `403`;
- budget count: no demostrado.

Conclusión de recovery en desarrollo: **baseline de PITR + scheduled backup cumplido y verificado en `atlasmap-dev`**. El 403 de budget refleja falta de visibilidad suficiente con la identidad actual y no demuestra que el proyecto carezca de budget.

### Diagnóstico de permisos de budget preparado

El repo incluye ahora un diagnóstico read-only específico que prueba por separado:

- visibilidad de budgets a nivel de billing account;
- visibilidad de budgets filtrados al proyecto `atlasmap-dev`;
- clasificación explícita `permission-blocked` cuando el API responde 403;
- sin serializar el billing account ID ni la cuenta activa.

El diagnóstico documenta dos caminos IAM de mínimo privilegio, basados en el contrato oficial vigente del Budget API:

- lectura a nivel billing account: `billing.budgets.list`, cubierto por `roles/billing.viewer`;
- lectura de budget de un solo proyecto: `resourcemanager.projects.get` + `billing.resourcebudgets.read`, cubierto por `roles/viewer` en el proyecto.

Para creación futura, el helper solo informa requisitos; **no crea ni modifica budgets**. El monto y los thresholds siguen sin definirse porque requieren una decisión aprobada, no una suposición del repo.

## Telemetría

### Baseline antes del despliegue acotado

Evidencia capturada a las `2026-08-11T21:52:01Z`, ventana de 7 días:

| stream | seen | latest |
|---|---:|---|
| `storage_v4_rollout_metric` | sí | `2026-08-11T19:13:47.321742Z` |
| `storage_v4_sync_metric` | no | — |
| `storage_v4_provider_cache_metric` | no | — |
| `storage_v4_provider_request_metric` | no | — |

### Despliegue controlado de telemetría

Evidencia capturada a las `2026-08-11T23:06:53Z` después de un deploy selectivo en `atlasmap-dev`:

- `geoapifyCityAutocomplete`: existe, `ACTIVE`, ingress `ALLOW_ALL`, Cloud Run invoker público presente y preflight CORS desde `http://localhost:5173` responde `204` con método `POST` permitido;
- `storageV4SyncTelemetry`: existe, `ACTIVE`, ingress `ALLOW_ALL`, Cloud Run invoker público presente y preflight CORS desde `http://localhost:5173` responde `204` con método `POST` permitido;
- el deploy fue acotado a esas dos Functions y no habilitó Storage v4 WRITE, migración, aggregates, lifecycle ni purge;
- el error CORS previo de `storageV4SyncTelemetry` quedó explicado por ausencia de la función antes del deploy, no por una política CORS defectuosa.

### Evidencia E2E de los cuatro streams

Prueba controlada desde el cliente autenticado:

- city autocomplete: `cacheHit=false`, `results=1`, suficiente para recorrer cache miss + request real de proveedor;
- sync telemetry: `syncOk=true` con evento operacional `queue-recovery`, sin activar Storage v4 WRITE.

Preflight de Logging capturado a las `2026-08-11T23:16:33Z`, ventana de 7 días:

| stream | seen | latest |
|---|---:|---|
| `storage_v4_rollout_metric` | sí | `2026-08-11T23:12:44.459781Z` |
| `storage_v4_sync_metric` | sí | `2026-08-11T23:13:12.100196Z` |
| `storage_v4_provider_cache_metric` | sí | `2026-08-11T23:13:11.223825Z` |
| `storage_v4_provider_request_metric` | sí | `2026-08-11T23:13:11.715676Z` |

Conclusión de observabilidad base en desarrollo: **4/4 streams estructurados observados en Cloud Logging con evidencia real**. Este checkpoint valida presencia y recorrido E2E de las señales; no sustituye todavía dashboard, alertas, carga sostenida ni medición de SLO bajo tráfico representativo.

## Bundle declarativo de observabilidad preparado

Trabajo de repositorio preparado después de cerrar 4/4 streams:

- siete definiciones de logs-based metrics bajo `ops/storage-v4/observability/metrics/`:
  - counters para rollout, sync, provider cache y provider request;
  - distribuciones de latencia para rollout, sync flush y provider request;
- `ops/storage-v4/observability/dashboard.json` con panel de logs y vistas para eventos/ratios/latencias, operaciones y storage de Firestore, y request count/p95 de Cloud Run;
- el dashboard de repositorio expone p50/p95/p99 para latencia del repositorio y usa como denominador de `Sync flush success ratio` únicamente eventos `flush`, evitando mezclar `queue-recovery`;
- tres templates de alert policy bajo `ops/storage-v4/observability/alerts/`, **deshabilitados por defecto** y sin notification channels;
- helper `storage-v4-phase-k-observability-apply-dev.ps1`, bloqueado a `atlasmap-dev`, dry-run por defecto, sin deletes, sin budgets y sin cambios de Storage v4 WRITE;
- preflight read-only para inventariar dashboard, policies y log-based metrics existentes.

Estado de este bundle: **preparado en repo, no aplicado ni validado server-side todavía**. No se declara dashboard creado ni alertas operacionales hasta obtener evidencia del entorno. Los thresholds de alertas son plantillas de desarrollo; en especial el threshold de proveedor se debe recalibrar con baseline real antes de habilitarse.

## SLO / resiliencia preparada

El repositorio incluye un preflight SLO read-only sobre Cloud Logging que calcula, sin mutar Cloud:

- rollout success rate y p50/p95/p99;
- sync flush success rate accionable y p50/p95/p99;
- cache hit rate sobre `hit + miss`, manteniendo `read-error` y `write-error` como señales separadas;
- provider success rate y p50/p95/p99;
- bandera de truncamiento si un stream alcanza el límite de muestra, para impedir tratar una muestra incompleta como SLO de ventana completa.

Además existe un smoke local agregado de resiliencia para cache fail-soft, tormenta de reconexión determinista y conflicto multidevice. Esa evidencia sigue siendo simulación de repositorio y **no sustituye** provider outage, reconnect ni multidevice E2E reales.

## Checkpoint cloud consolidado preparado

`phase-k:cloud-checkpoint` agrupa en una sola intervención local, exclusivamente read-only:

1. recovery/billing/telemetry;
2. diagnóstico detallado de permisos de budget;
3. muestra SLO desde Cloud Logging;
4. inventario de Monitoring;
5. readiness de restore.

El checkpoint no contiene `--apply`, no despliega Functions, no crea dashboard, no restaura bases y no toca producción.

## Próximos checkpoints de Phase K

1. aplicar/validar en un único checkpoint controlado el bundle de observabilidad dev cuando corresponda;
2. ejecutar el diagnóstico de budget con la identidad local y resolver solo el permiso necesario; luego definir monto/thresholds aprobados, sin inventarlos;
3. restore drill usando un backup real cuando exista un backup disponible para restauración;
4. provider outage E2E;
5. multidevice E2E en navegadores/dispositivos reales;
6. load/reconnect E2E y medición de SLOs;
7. completar el modelo de costos con supuestos medidos y precios vigentes.

## Límites

- Producción no fue tocada.
- No se activó Storage v4 WRITE.
- No se ejecutó migración.
- No se creó `atlas-cache` físico.
- No se infiere que exista o no exista un budget mientras el probe no lo pueda demostrar.
- La existencia de un scheduled backup no implica que ya exista un backup restaurable; el restore drill queda pendiente hasta verificar uno disponible.
- Las nuevas definiciones de dashboard/metrics/alerts no son evidencia cloud hasta que se apliquen y se verifiquen explícitamente.
