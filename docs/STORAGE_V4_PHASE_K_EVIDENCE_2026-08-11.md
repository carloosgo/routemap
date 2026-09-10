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

### Restore drill real — PASS

Backup usado:

- `projects/atlasmap-dev/locations/northamerica-south1/backups/55a35516-c5e0-447a-a123-7f4285b5ce6a`;
- estado observado previamente: `READY`;
- snapshot: `2026-08-12T02:05:06.847993Z`.

Restore aislado observado el `2026-08-12`:

- destino: `atlas-restore-drill-20260812-031227`;
- location: `northamerica-south1`;
- `(default)` permaneció intacta;
- producción permaneció intacta;
- Storage v4 WRITE permaneció deshabilitado;
- la operación administrada de restore terminó antes de iniciar la lectura;
- `sourceInfo.backup` de la base restaurada coincide con el backup seleccionado;
- la base restaurada fue legible;
- se inventariaron `345` documentos;
- el validador no expuso contenido de documentos;
- resultado del checkpoint: `restoreCheckpointPassed=true`.

El snapshot del backup tiene segundos/fracciones y, al momento de la validación, era mayor a una hora. Firestore no permitía consultar independientemente ese instante exacto mediante PITR, por lo que no se afirmó paridad SHA-256 contra un instante aproximado. En su lugar, el PASS se basa en procedencia administrada verificada, finalización de la operación y lectura/inventario exitosos de la base restaurada. No se redondeó el timestamp para fabricar una comparación falsa.

### Cleanup explícito de restores temporales — PASS

Antes del cleanup se inventariaron tres bases `atlas-restore-drill-*`:

- `atlas-restore-drill-20260812-025651`;
- `atlas-restore-drill-20260812-030557`;
- `atlas-restore-drill-20260812-031227`.

Las tres estaban en `northamerica-south1`, exponían `sourceInfo.backup` al mismo backup de Phase K, `sourceInfo.operation`, `etag` individual y `progress: COMPLETED`. El cleanup endurecido validó cada destino por nombre exacto y eliminó únicamente esas bases temporales de restore. La ejecución final reportó que las bases temporales validadas fueron eliminadas y que `(default)` permaneció intacta.

Conclusión: **el restore drill queda cerrado limpiamente en dev: backup + restore + lectura/inventario + cleanup explícito completados, sin tocar `(default)` ni producción**.

### Budget visibility — PASS; creación pendiente de aprobación

El diagnóstico original había observado `403` al listar budgets. El probe fue endurecido progresivamente para:

- enviar `x-goog-user-project: atlasmap-dev`;
- verificar si `billingbudgets.googleapis.com` estaba habilitada;
- comprobar `serviceusage.services.use`, `resourcemanager.projects.get`, `billing.resourcebudgets.read` y `billing.budgets.list` mediante probes read-only / `testIamPermissions`;
- no exponer el billing account ID;
- no mutar budgets, IAM ni producción.

La ejecución de `2026-08-12T06:45:12Z` aisló la causa del `403`: **Cloud Billing Budget API deshabilitada**, mientras los permisos requeridos estaban presentes. La API `billingbudgets.googleapis.com` fue habilitada explícitamente en `atlasmap-dev` y la operación terminó correctamente.

Rerun posterior a `2026-08-12T07:28:34Z`:

- `budgetApi.enabled=true`;
- `serviceUsageUse=true`;
- `resourceManagerProjectsGet=true`;
- `billingResourceBudgetsRead=true`;
- `billingBudgetsList=true`;
- account-scope: HTTP `200`, `budgetCount=0`;
- project-scope: HTTP `200`, `budgetCount=0`;
- `visibility=single-project-budget-readable`;
- `diagnosis=budget-readable`.

Conclusión: **budget visibility PASS** y ausencia de budget confirmada (`0`). No se crea un budget todavía porque no existe un monto/thresholds aprobados. El repo conserva un generador de plan que exige monto explícito y no muta Cloud.

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

Estado final verificado por Monitoring REST v1 a las `2026-08-12T17:27:16Z`:

- se detectaron inicialmente dos dashboards Atlas dev equivalentes:
  - `2d6f5b70-dc89-43d8-87c7-f44c8a80f108`;
  - `8d6a1c24-ea96-4bc3-848d-442a40b2adef`;
- el cleanup REST validó exactamente ambos recursos, conservó explícitamente `8d6a1c24-ea96-4bc3-848d-442a40b2adef` y eliminó únicamente `2d6f5b70-dc89-43d8-87c7-f44c8a80f108`;
- post-check del cleanup: `remainingAtlasDashboardCount=1`;
- preflight independiente posterior: HTTP `200`, `dashboardTransport=monitoring-rest-v1`, `atlasDashboardCount=1`;
- alert policies, log metrics, budgets, Storage v4 WRITE y producción permanecieron intactos.

Durante el diagnóstico se detectó que el cleanup anterior mezclaba `gcloud dashboards list/describe`, mientras el preflight veía ambos recursos. El helper fue corregido para usar la misma fuente de verdad REST que el preflight, y el launcher ahora reenvía realmente `--preferred-dashboard-id`. Además, el apply de observabilidad aborta si detecta más de un dashboard Atlas antes de mutar recursos.

Conclusión: **dashboard Atlas dev limpio y verificado con exactamente un recurso canónico**.

### Notification channels

Preflight final a las `2026-08-12T17:27:16Z` mediante Monitoring REST v3:

- `notificationChannelProbeStatus=ok`;
- HTTP `200`;
- `notificationChannelCount=0`;
- `enabledVerifiedNotificationChannelCount=0`;
- `enabledUsableNotificationChannelCount=0`;
- las tres alert policies tienen `notificationChannelCount=0`;
- las tres policies continúan `enabled=false`.

Conclusión: **el inventario de canales es conocido y limpio, pero todavía no existe un canal de notificación**. La creación/asociación/activación queda pendiente de un destino explícitamente aprobado y de baseline representativo.

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
- matriz determinista adicional de reconnect para `1k`, `10k`, `50k` y `100k` clientes, verificando dispersión en el backoff capped y límites de las bandas `1/2/4/8/16/30s`;
- conflicto multidevice entity-level sin pérdida silenciosa;
- contención determinista de `100` dispositivos sobre la misma entidad/version: exactamente un ganador y `99` conflictos explícitos, preservando el payload local de cada perdedor y el snapshot remoto ganador sin pérdida silenciosa.

La matriz de `1k/10k/50k/100k` y la contención de `100` dispositivos son pruebas del modelo local, no evidencia E2E ni una afirmación de capacidad real del backend. Sigue pendiente evidencia E2E real de provider outage, reconnect y múltiples navegadores/dispositivos.

## Wiring de sync flush

Revisión de código confirma que el `syncLifecycleController` ya emite métricas `flush` para `success`, `not-leader` y `unexpected-error`, incluyendo duración y contadores agregados saneados. `syncRuntime` propaga `lifecycleOptions.onMetric` tanto a recuperación de cola como al lifecycle de flush. La composición web v4 acepta `lifecycleOptions`, pero sigue deliberadamente aislada del repositorio activo por Gate G READ; no se activó Storage v4 WRITE para fabricar una muestra real de `flush`.

Conclusión: la ausencia de una muestra Cloud `flush` no se debe a falta del contrato de instrumentación; se debe a que el runtime de escritura v4 continúa sin activarse globalmente, como exige el rollout actual.

## Límites y próximos checkpoints

- Producción no fue tocada.
- Storage v4 WRITE sigue deshabilitado.
- No se ejecutó migración.
- `atlas-cache` físico sigue pendiente de Phase J.
- Budget visibility: **PASS**, API habilitada y `budgetCount=0`; falta monto/thresholds aprobados antes de crear uno.
- Restore drill real: **PASS en dev y cleanup explícito completado**; no quedan restores temporales validados pendientes de este drill.
- Dashboard Atlas dev: **PASS con exactamente uno**, validado por Monitoring REST v1 tras cleanup explícito del duplicado.
- Notification channels: **inventario PASS, count=0**; falta destino aprobado, creación/verificación y asociación antes de activar policies.
- Falta una muestra real `sync flush` una vez que exista un entorno/flujo de escritura v4 autorizado; no se habilita WRITE solo para generar telemetría.
- Falta load/reconnect/provider-outage/multidevice E2E y recalibrar thresholds/SLO con tráfico representativo.
