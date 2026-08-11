# Atlas Storage v4 — Phase K evidence — 2026-08-11

Entorno: `atlasmap-dev`

Este documento registra evidencia observada del entorno. No autoriza producción ni cambia configuración cloud por sí mismo.

## Preflight Firestore / billing

Evidencia capturada a las `2026-08-11T21:25:07Z`:

- database: `(default)`;
- location: `northamerica-south1`;
- billing: habilitado;
- PITR: `POINT_IN_TIME_RECOVERY_DISABLED`;
- retention de versiones actual: `3600s` (una hora, consistente con PITR deshabilitado);
- earliest version time observado: `2026-08-11T20:25:02.668567Z`;
- delete protection: `DELETE_PROTECTION_DISABLED`;
- backup schedule probe: `ok`;
- backup schedules: `0`;
- budget: estado todavía no comprobado; la lectura account-level no devolvió un resultado utilizable con la identidad actual.

Conclusión de recovery en desarrollo: **PITR y scheduled backups todavía no cumplen el baseline definido por Phase K**.

## Telemetría

Evidencia capturada a las `2026-08-11T21:25:20Z`, ventana de 7 días:

| stream | seen | latest |
|---|---:|---|
| `storage_v4_rollout_metric` | sí | `2026-08-11T19:13:47.321742Z` |
| `storage_v4_sync_metric` | no | — |
| `storage_v4_provider_cache_metric` | no | — |
| `storage_v4_provider_request_metric` | no | — |

Interpretación:

- la señal de rollout sigue teniendo evidencia E2E real;
- las señales de sync/cache/provider están preparadas en código pero todavía no tienen evidencia cloud observada;
- la ausencia de esas señales no se interpreta como fallo funcional mientras sus caminos todavía no hayan sido desplegados/ejercitados en el entorno controlado.

## Próximos checkpoints de Phase K

1. recovery dev: habilitar PITR y crear scheduled backup con una política explícita;
2. repetir preflight y registrar evidencia del estado habilitado;
3. resolver/observar budget project-scoped sin exponer el billing account;
4. desplegar y ejercitar las señales nuevas de telemetría en entorno controlado;
5. dashboard + alertas;
6. restore drill;
7. provider outage, multidevice y load/reconnect E2E;
8. medir SLOs y completar el modelo de costos con supuestos medidos y precios vigentes.

## Límites

- Producción no fue tocada.
- No se activó Storage v4 WRITE.
- No se ejecutó migración.
- No se creó `atlas-cache` físico.
- No se infiere que exista un budget mientras el probe no lo pueda demostrar.
