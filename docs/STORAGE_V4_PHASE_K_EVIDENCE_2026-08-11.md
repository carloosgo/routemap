# Atlas Storage v4 — Phase K evidence — 2026-08-11

Entorno: `atlasmap-dev`

Este documento registra evidencia observada del entorno. No autoriza producción ni cambia configuración cloud por sí mismo.

## Recovery / Firestore / billing

### Baseline antes de recovery

Evidencia capturada a las `2026-08-11T21:25:07Z`:

- database: `(default)`;
- location: `northamerica-south1`;
- billing: habilitado;
- PITR: `POINT_IN_TIME_RECOVERY_DISABLED`;
- retention de versiones: `3600s`;
- backup schedule probe: `ok`;
- backup schedules: `0`.

### Recovery dev activo

Reconfirmado en el checkpoint consolidado a las `2026-08-12T01:59:31Z`:

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
- retención del backup: `604800s` (7 días).

Conclusión de recovery en desarrollo: **baseline PITR + scheduled backup cumplido y verificado en `atlasmap-dev`**.

### Backup restaurable ya disponible

Restore readiness capturado a las `2026-08-12T02:16:09Z`:

- `sourceBackupCount=1`;
- backup: `projects/atlasmap-dev/locations/northamerica-south1/backups/55a35516-c5e0-447a-a123-7f4285b5ce6a`;
- estado: `READY`;
- snapshot: `2026-08-12T02:05:06.847993Z`;
- expiración: `2026-08-19T02:05:06.847993Z`;
- restore drill databases existentes: `0`.

Esto cierra **readiness de restore**, no el restore drill: todavía falta crear la base aislada, medir RTO y validar el contenido restaurado.

### Budget: bloqueo de permisos demostrado

El checkpoint volvió a obtener HTTP `403` en el probe original. El diagnóstico específico de budget a las `2026-08-12T02:09:48Z` confirmó:

- billing habilitado;
- billing account asociado presente;
- lectura account-scope: `403`;
- lectura project-scope: `403`;
- clasificación: `permission-blocked`;
- budget count: no observable con la identidad actual.

Conclusión: el estado del budget sigue **desconocido**. No se interpreta como ausencia de budget y no se inventa monto. El repo documenta la ruta IAM de lectura y contiene un generador local de plan que exige un monto explícito y no muta Cloud.

## Telemetría

### Despliegue y E2E

- `geoapifyCityAutocomplete`: `ACTIVE`, ingress `ALLOW_ALL`, Cloud Run invoker público y CORS localhost `204`;
- `storageV4SyncTelemetry`: `ACTIVE`, ingress `ALLOW_ALL`, Cloud Run invoker público y CORS localhost `204`;
- prueba de city autocomplete: `cacheHit=false`, `results=1`;
- prueba autenticada de sync telemetry: `syncOk=true` sin activar Storage v4 WRITE.

Checkpoint de Logging reconfirmado a las `2026-08-12T02:01:10Z`:

| stream | seen | latest |
|---|---:|---|
| `storage_v4_rollout_metric` | sí | `2026-08-11T23:16:55.845556Z` |
| `storage_v4_sync_metric` | sí | `2026-08-11T23:13:12.100196Z` |
| `storage_v4_provider_cache_metric` | sí | `2026-08-11T23:13:11.223825Z` |
| `storage_v4_provider_request_metric` | sí | `2026-08-11T23:13:11.715676Z` |

Conclusión: **4/4 streams estructurados siguen visibles en Cloud Logging**.

## Observabilidad Cloud aplicada

Checkpoint aplicado y post-verificado el `2026-08-11` local / `2026-08-12` UTC.

### Logs-based metrics

Las siete métricas esperadas existen y fueron verificadas:

- `atlas_storage_v4_provider_cache_events`;
- `atlas_storage_v4_provider_latency_ms`;
- `atlas_storage_v4_provider_request_events`;
- `atlas_storage_v4_rollout_events`;
- `atlas_storage_v4_rollout_latency_ms`;
- `atlas_storage_v4_sync_events`;
- `atlas_storage_v4_sync_latency_ms`.

Todas aparecen con `disabled=false`.

### Alert policies

Existen exactamente las tres policies esperadas y las tres permanecen **deshabilitadas**:

- provider errors;
- repository errors;
- sync unexpected errors.

Cada policy se identifica operacionalmente por labels/metric type, no por Unicode de `displayName`, y ninguna tiene activación accidental.

### Dashboard

El dashboard esperado está creado y verificado por labels `system=atlas-storage-v4`, `environment=dev`.

El inventario mostró **dos dashboards Atlas Storage v4**. Esta duplicación provino de los retries anteriores mientras la verificación por `displayName` Unicode daba falsos negativos en Windows PowerShell. No se borró ninguno automáticamente porque el helper no realiza deletes. Se debe conservar uno y retirar el duplicado en un cleanup dev explícito separado.

IDs observados:

- `projects/833327011450/dashboards/2d6f5b70-dc89-43d8-87c7-f44c8a80f108`;
- `projects/833327011450/dashboards/8d6a1c24-ea96-4bc3-848d-442a40b2adef`.

El mojibake mostrado por `gcloud` como `?` afecta representación en Windows CLI; la identidad operativa se valida por labels ASCII.

## SLO sample

Muestra read-only a las `2026-08-12T02:11:35Z`, ventana `7d`, sin truncamiento observado:

### Rollout

- entries: `38`;
- success: `38`;
- error: `0`;
- success rate: `100%`;
- p50: `196 ms`;
- p95: `912 ms`;
- p99: `4465 ms`.

### Provider

- request success: `1`;
- request errors: `0`;
- success rate: `100%`;
- latencia observada: `490 ms`;
- cache: `1 miss`, `0 hit`, sin read/write errors.

### Sync

La evidencia disponible era `queue-recovery`, no un `flush`, por lo que no existe todavía muestra válida para `sync flush` success rate ni percentiles.

El primer output mostró `entries=null` para streams singleton debido a un detalle de PowerShell que desenvuelve pipelines de un elemento. El repo ya fue corregido para forzar arrays en `Read-Stream`/`Payloads`; los ratios y valores de provider/cache anteriores sí provenían del evento real, pero el contador `entries` debe reconfirmarse en el siguiente read-only checkpoint.

Estos números son una **muestra inicial**, no un SLO de producción ni una prueba de carga representativa.

## Resiliencia determinista

El repo cubre en smoke local:

- cache fail-soft;
- provider `429`, `503`, network error y JSON inválido;
- fallo del metric sink sin romper la operación;
- reconnect storm determinista de 1,000 clientes con jitter;
- conflicto multidevice entity-level sin pérdida silenciosa.

Sigue pendiente evidencia E2E real de provider outage, reconnect y múltiples navegadores/dispositivos.

## Límites y próximos checkpoints

- Producción no fue tocada.
- Storage v4 WRITE sigue deshabilitado.
- No se ejecutó migración.
- `atlas-cache` físico sigue pendiente de Phase J.
- Budget sigue bloqueado por permisos de lectura.
- Restore drill real ya puede ejecutarse porque existe un backup `READY`, pero es una operación cost-bearing y debe usar una base aislada `atlas-restore-drill-*`.
- Falta limpiar un dashboard duplicado mediante acción destructiva dev explícita y separada.
- Falta generar tráfico `sync flush` real para medir esa señal.
- Falta load/reconnect/provider-outage/multidevice E2E y recalibrar thresholds/SLO con tráfico representativo.
