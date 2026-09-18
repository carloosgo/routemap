# Atlas Storage v4 — Phase K closeout — 2026-08-14

## Estado

**Phase K queda cerrada para desarrollo (`atlasmap-dev`).**

Este cierre no autoriza producción. Distingue dos cosas que antes estaban mezcladas:

1. construcción y prueba operacional de la arquitectura en dev;
2. aceptación de rollout con tráfico/product assumptions reales, que pertenece a Phase L.

## Evidencia cerrada en dev

### Recovery

- PITR habilitado, ventana de 7 días;
- backup diario con retención de 7 días;
- backups `READY` observados;
- restore drill real a base aislada: PASS;
- cleanup del restore drill: PASS;
- 0 bases temporales de restore remanentes en el checkpoint posterior.

### Observabilidad

- 4/4 streams estructurados observados;
- 7/7 logs-based metrics existentes;
- exactamente 1 dashboard Atlas Storage v4 dev;
- exactamente 1 notification channel email Atlas usable;
- 3/3 alert policies permanentes habilitadas en dev;
- asociaciones de canal conservadas;
- firing real de una policy temporal observado mediante incidente `OPEN` de Cloud Monitoring;
- cleanup de la policy temporal: PASS.

La recepción humana del email no fue verificada in-band y no se declara como evidencia.

### Billing

- billing habilitado;
- Budget API legible;
- permisos create/list confirmados;
- exactamente 1 budget project-scoped para `atlasmap-dev`;
- monto: 500 MXN/mes;
- thresholds: 50%, 80%, 100%;
- el budget no se interpreta como hard cap automático;
- el runner quedó endurecido para exigir amount y thresholds explícitos en futuras creaciones.

### Resiliencia / carga

- provider outage E2E real: PASS;
- sync flush E2E real: PASS;
- purge físico real en fixture aislado: PASS;
- migration/rollback/remigration cloud real: PASS;
- reconnect/capacity determinista: PASS;
- multidevice/contención determinista: PASS;
- carga cloud de 120 hijos: PASS;
- reconnect con 60 updates: 60/60 success;
- aggregates convergentes;
- cleanup: PASS.

Las latencias medidas en el stress drill son evidencia de robustez, no un SLO productivo.

### CI

El bloque dev mantiene como requisito:

- unit tests PASS;
- Firestore Rules PASS;
- Phase K scoped Rules PASS;
- ESLint PASS;
- production build PASS;
- Dependency audit PASS;
- CodeQL PASS.

## Cost model — qué queda cerrado y qué no

La implementación del modelo de capacidad/costo está cerrada:

- escenarios 1k / 10k / 50k / 100k usuarios activos;
- inputs de capacidad explícitos, sin defaults de producto;
- price book explícito y fechado;
- Geoapify modelado por tier y no por precio lineal inventado;
- clasificación `simulation | measured | approved`;
- una simulación no puede convertirse silenciosamente en forecast.

No existe todavía una base suficiente para publicar un forecast productivo aprobado porque faltan supuestos de uso real/aceptados —por ejemplo sesiones por usuario, reads/mutations por sesión, cache-hit representativo y storage por usuario—. Inventar esos valores solo para cerrar K degradaría la calidad del gate.

**Decisión de cierre:** el tooling económico queda cerrado en K; la aceptación de supuestos y forecast se convierte en requisito de **L2 — recovery/costo**, antes de activar tráfico productivo significativo.

## Latencia — carry-forward

El stress drill observó colas largas en hydrate/aggregate bajo el fixture acotado. Como no hubo pérdida de datos, failures ni falta de convergencia, K queda cerrada funcionalmente.

La decisión de si esas latencias son aceptables para usuarios reales requiere tráfico/browser y objetivos de producto. Por tanto:

- baseline/acceptance de lectura: L4;
- tuning antes de ampliar READ: L4;
- aceptación de sync/write y conflicto real: L6;
- muestra multi-browser/device, si se conserva como gate estricto: L4/L6.

## Phase J

J queda cerrada para v4.0 con separación lógica obligatoria. La database física `atlas-cache` permanece diferida mientras el acceso named-database server-side elegido siga marcado Preview/no-production. Esto no bloquea L.

## Frontera A–K / L

A partir de este closeout, no deben añadirse nuevos requisitos a K salvo que una regresión pruebe que una capacidad ya declarada como cerrada no funciona.

Los pendientes legítimos pasan a Phase L:

- L0: proyecto/ubicación productivos explícitos;
- L1: seguridad/datos productivos;
- L2: recovery + forecast/costo aprobado;
- L3: App Check en observación;
- L4: READ gradual + baseline de latencia;
- L5: materialización/verificación;
- L6: WRITE controlado + evidencia multidevice si aplica;
- L7: convergencia y retiro de v3.

Producción permanece intacta hasta una aprobación explícita.