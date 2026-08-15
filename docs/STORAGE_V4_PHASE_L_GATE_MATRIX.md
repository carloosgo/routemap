# Atlas Storage v4 — Phase L gate matrix

Fecha: **2026-08-14**

Esta matriz separa tres conceptos: implementación de soporte, evidencia cloud y autorización de rollout. Tener un runner o test listo no equivale a haber cerrado el gate productivo.

| Gate | Soporte repo | Evidencia cloud | Estado operativo |
|---|---|---|---|
| L0 target productivo | listo | PASS | cerrado |
| L1 seguridad/Auth | listo | PASS | cerrado fail-closed |
| L2 recovery/costo | runners listos | pendiente preflight/apply | bloqueado por comprobación local + aprobación de costo/retención |
| L3 App Check | cliente preintegrado + preflight listo | pendiente | preparado, no habilitado/enforced |
| L4 READ | planner + contratos/tests listos | ninguna | no iniciado productivamente |
| L5 materialización | planner + contratos/tests listos | ninguna | no iniciado productivamente |
| L6 WRITE | planner + contratos/tests listos | ninguna | no iniciado productivamente |
| L7 convergencia | planner + contratos/tests listos | ninguna | no iniciado productivamente |

## Acciones que requieren sesión local/autenticada

### Próxima ventana

1. `npm run phase-l:l2:preflight-prod -- --check-cloud`
2. `npm run phase-l:l3:preflight-prod -- --check-cloud`

Ambos son read-only.

### Después del preflight L2

Las siguientes mutaciones requieren decisión explícita antes de ejecutarse:

- PITR productivo;
- schedule de backups y retención;
- budget productivo y thresholds.

El restore drill productivo deberá usar una database temporal aislada y cleanup protegido; nunca `(default)`.

### L3+

Crear/configurar App Check/reCAPTCHA Enterprise, desplegar Rules READ, Remote Config, telemetría/Functions, materializar, habilitar WRITE y retirar v3 son checkpoints independientes. Ninguno queda autorizado por cerrar el gate anterior.

## Guardas transversales

- `atlasmap-prod` es target explícito para runners productivos L1+.
- runners mutables actuales L0–L2 exigen token de confirmación específico.
- planners L4–L7 rechazan `--apply`/`--confirm`.
- no hay porcentajes de cohorte por default.
- no hay tamaño de muestra L5 por default.
- Storage v4 WRITE sigue deshabilitado hasta L6.
- v3 no se retira antes de canonical v4 = 100% y gate explícito L7.
- delete de viaje permanece irreversible para el usuario; backup/DR no crea restore público.

## Criterio de avance

Un gate puede marcarse PASS productivo únicamente con evidencia del entorno correspondiente. Tests/CI verdes validan el código y las guardas, pero no sustituyen evidencia cloud ni rollout real.
