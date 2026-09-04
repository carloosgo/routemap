# Atlas Storage v4 — Phase L7 convergence entry

Fecha: **2026-08-14**

Target: `atlasmap-prod`.

L7 es el gate de convergencia final. Su objetivo es hacer v4 canónico y retirar v3 únicamente después de que recovery/costo, App Check, READ, materialización y WRITE hayan producido evidencia estable.

## Principios

- L7 no es una migración masiva automática.
- No existe dual-write permanente como estado final válido.
- v3 no se retira antes de que v4 alcance 100% canónico y no existan clientes activos dependientes de v3.
- El retiro de v3 exige ventana explícita, backup final y rollback operacional documentado.
- La eliminación de un viaje sigue siendo definitiva para el usuario; L7 no introduce UI/API pública de restore de viaje completo.
- Restore de backup/recovery operacional es un mecanismo distinto y no cambia esas semánticas de producto.

## Runner de preparación

`npm run phase-l:l7:convergence-plan-prod -- --canonical-percent=<n>`

Opcionalmente, únicamente con 100%:

`npm run phase-l:l7:convergence-plan-prod -- --canonical-percent=100 --retire-v3`

El runner es plan-only: rechaza `--apply` y `--confirm`, no cambia Remote Config, Rules, Functions ni datos.

## Prerrequisitos para ampliar canonical v4

1. L2 recovery + costo PASS.
2. L3 App Check observado y con estrategia de enforcement/rollback definida.
3. L4 READ estable con errores/latencia dentro de aceptación.
4. L5 materialización verificada contra v3.
5. L6 WRITE estable, incluyendo lifecycle/purge y conflictos.
6. cero pérdida silenciosa de datos.
7. cero fallos de aislamiento cross-user.
8. telemetry sin PII/contenido de viaje.
9. forecast/billing dentro del rango aprobado.

## Gate para retirar v3

Retirar v3 requiere simultáneamente:

- v4 canonical = 100%;
- ausencia de clientes activos que dependan de v3;
- ausencia de migraciones/digests pendientes;
- consistencia de aggregates y lifecycle;
- backup final READY antes del cambio irreversible de arquitectura;
- ventana de retiro explícita;
- procedimiento de rollback documentado para incidentes de plataforma;
- confirmación posterior de que no existe dual-write residual.

El backup final no concede restore de viajes al usuario. Sirve únicamente para disaster recovery/operación.

## Definición de 100% del proyecto Storage v4

El plan A–L puede declararse cerrado únicamente cuando:

- v4 es canónico;
- v3 ya no recibe escrituras ni es dependencia activa del cliente;
- no existe dual-write permanente;
- recovery, observabilidad, budget/costo y App Check están operativos;
- READ/WRITE v4 tienen evidencia productiva estable;
- la ruta v3 está retirada o tiene una condición/fecha explícita restante aprobada.
