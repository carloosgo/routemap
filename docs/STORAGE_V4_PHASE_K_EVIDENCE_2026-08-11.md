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

## Próximos checkpoints de Phase K

1. resolver permisos/visibilidad de budget y configurar alertas de costo;
2. dashboard + alertas operacionales sobre las señales ya observadas;
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
