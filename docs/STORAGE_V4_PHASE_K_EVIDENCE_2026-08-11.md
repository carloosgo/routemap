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

Evidencia capturada a las `2026-08-11T21:51:49Z`:

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

Interpretación:

- la infraestructura necesaria para observar `storage_v4_sync_metric` ya está desplegada y accesible desde el cliente autenticado;
- `geoapifyCityAutocomplete` ya está desplegada con la instrumentación de provider cache/request;
- todavía falta ejercitar ambos caminos y volver a consultar Logging antes de declarar observados `storage_v4_sync_metric`, `storage_v4_provider_cache_metric` y `storage_v4_provider_request_metric`.

## Próximos checkpoints de Phase K

1. ejercitar en `atlasmap-dev` una llamada de city autocomplete con cache miss y una llamada autenticada de `storageV4SyncTelemetry`;
2. repetir el preflight y registrar evidencia Cloud de los tres streams nuevos;
3. resolver permisos/visibilidad de budget y configurar alertas de costo;
4. dashboard + alertas operacionales;
5. restore drill;
6. provider outage, multidevice y load/reconnect E2E;
7. medir SLOs y completar el modelo de costos con supuestos medidos y precios vigentes.

## Límites

- Producción no fue tocada.
- No se activó Storage v4 WRITE.
- No se ejecutó migración.
- No se creó `atlas-cache` físico.
- No se infiere que exista o no exista un budget mientras el probe no lo pueda demostrar.
