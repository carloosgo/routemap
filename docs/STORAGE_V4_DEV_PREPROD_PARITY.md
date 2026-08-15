# Atlas Storage v4 — Dev as production-like preproduction

Fecha: **2026-08-15**

## Objetivo

`atlasmap-dev` es el entorno real de integración/preproducción mientras Atlas continúa recibiendo cambios de producto. Debe conservar, siempre que sea técnicamente útil y económicamente razonable, las mismas clases de infraestructura que producción sin usar `atlasmap-prod` para pruebas funcionales.

```text
local/emulators -> iteración rápida y tests deterministas
atlasmap-dev    -> preprod real, integración cloud y pilotos controlados
atlasmap-prod   -> infraestructura protegida, rollout funcional congelado
```

## Dos estados válidos de Remote Config en dev

No deben confundirse dos objetivos distintos:

1. **Steady-state fail-closed**: entre experimentos, `storage_v4_enabled=false`, kill switch activo y cohorte 0. El runner `runStorageV4DevSteadyState.mjs` conserva esta guarda fuerte.
2. **Preprod parity / controlled pilot**: durante integración real, v4 puede permanecer activo en `atlasmap-dev` con `mode=pilot`, kill switch desactivado y porcentaje explícito > 0. Esto no representa drift mientras backend, Rules, Eventarc y readiness sigan íntegros.

El preflight `runStorageV4DevPreprodParity.mjs` acepta ambos estados y rechaza cualquier configuración intermedia/inconsistente.

## Infraestructura real ya presente en atlasmap-dev

Evidencia acumulada al 2026-08-14/15:

- Firestore real `(default)` en `northamerica-south1`;
- PITR habilitado, 7 días;
- backup schedule diario, retención 7 días;
- backups READY observados;
- restore drill real ejecutado y cleanup verificado;
- 3 Cloud Functions v4 Node.js 22 activas;
- 5 triggers Eventarc reales con service account dedicada;
- Firestore Rules v4 pilot staged y verificables por SHA;
- Remote Config real con kill switch y cohortes explícitas;
- migración v3 -> v4, rollback, re-migración y purge físico probados en cloud dev;
- cuatro streams de telemetry reales;
- un dashboard Atlas;
- siete logs-based metrics;
- tres alert policies;
- un notification channel de email usable asociado a las tres policies;
- billing habilitado y Budget API legible;
- SLO/preflight, recovery, restore, observability y cost tooling de Phase K.

La ubicación de dev no tiene que copiar la región productiva para demostrar la clase de infraestructura. No se migra la base dev sólo para igualar `us-central1`; la paridad buscada es funcional/operativa salvo que una prueba dependa específicamente de región.

## Gaps de paridad que sí aportan valor

### Budget dev

La infraestructura para inspeccionar/crear un budget existe, pero el último closeout observó `budgetCount=0`. Crear un budget real en dev aporta paridad operativa y debe mantener monto/thresholds explícitos; ninguna cantidad se infiere por defecto.

### Alertas activas + delivery drill

Las tres alert policies existen pero permanecen deshabilitadas. Antes de activarlas deben revisarse thresholds para no convertir tráfico de debug/failure-injection en ruido permanente. El canal de email ya existe y está asociado.

### Carga/concurrencia real representativa

Las simulaciones deterministas ya existen. Conviene complementar con muestras reales cloud y al menos una prueba real de dos navegadores/dispositivos antes del rollout productivo.

### App Check en dev

Se preparará App Check en `atlasmap-dev` sin depender del dominio productivo definitivo.

- Para una URL de preprod estable se usará App Check + reCAPTCHA Enterprise.
- Para `localhost` se usará el mecanismo de debug token de Firebase App Check; `localhost` no se añadirá a los dominios permitidos de reCAPTCHA.
- debug tokens nunca se guardan en el repo ni se reutilizan en producción.
- enforcement se activa sólo después de observation y evidencia de tráfico legítimo.

La creación de Hosting/site key/registro/enforcement en cloud continúa siendo una mutación explícita y no queda autorizada por este documento.

## Preflight de paridad

Ejecutar:

```powershell
node scripts/runStorageV4DevPreprodParity.mjs
```

Es estrictamente read-only. Verifica:

- target exactamente `atlasmap-dev`;
- producción declarada fuera de alcance;
- Functions v4 activas;
- Eventarc válido;
- Rules coincidentes con el candidato aprobado;
- readiness candidates completos;
- Remote Config en fail-closed **o** pilot controlado;
- checkpoint Phase K de recovery/billing/telemetry/SLO/monitoring/restore-readiness.

Un pilot activo no hace fallar este auditor por sí mismo. Sí falla si detecta drift de infraestructura o un estado Remote Config inconsistente.

## Regla de mutaciones

`atlasmap-dev` puede recibir infraestructura real y datos sintéticos/controlados, pero cada operación cloud mutable continúa usando el token/confirmación de su runner correspondiente. `continúa` no sustituye aprobaciones de costo, IAM, enforcement, deploy o cambios destructivos cuando el runner ya las exige.

`atlasmap-prod` permanece congelado para desarrollo de funcionalidades hasta una decisión explícita de retomar Phase L.
