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

Evidencia capturada a las `2026-08-11T21:52:01Z`, ventana de 7 días:

| stream | seen | latest |
|---|---:|---|
| `storage_v4_rollout_metric` | sí | `2026-08-11T19:13:47.321742Z` |
| `storage_v4_sync_metric` | no | — |
| `storage_v4_provider_cache_metric` | no | — |
| `storage_v4_provider_request_metric` | no | — |

Interpretación:

- la señal de rollout conserva evidencia E2E real;
- las señales de sync/cache/provider están preparadas en código pero todavía no tienen evidencia cloud observada;
- la ausencia de esas señales no se interpreta como fallo funcional mientras sus caminos todavía no hayan sido desplegados/ejercitados en el entorno controlado.

## Próximos checkpoints de Phase K

1. desplegar de forma acotada la telemetría nueva y ejercitar provider cache/request en `atlasmap-dev`;
2. obtener evidencia de `storage_v4_sync_metric` sin activar Storage v4 WRITE globalmente;
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
