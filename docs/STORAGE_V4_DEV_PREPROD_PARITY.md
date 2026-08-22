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

La fuente de cierre para Phase K es `STORAGE_V4_PHASE_K_CLOSEOUT_2026-08-14.md`. Evidencia acumulada al 2026-08-14/15:

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
- 3/3 alert policies permanentes habilitadas;
- un notification channel de email usable asociado a las tres policies;
- alert-delivery drill real con incidente `OPEN` y cleanup de policy temporal;
- billing habilitado y Budget API legible;
- exactamente 1 budget project-scoped: `Atlas Storage v4 dev`, 500 MXN/mes, thresholds 50/80/100%;
- provider outage E2E, sync flush E2E y purge físico real PASS;
- carga cloud de 120 hijos PASS;
- reconnect 60/60 updates PASS;
- simulaciones de multidevice/contención PASS;
- SLO/preflight, recovery, restore, observability y cost tooling de Phase K.

La ubicación de dev no tiene que copiar la región productiva para demostrar la clase de infraestructura. No se migra la base dev sólo para igualar `us-central1`; la paridad buscada es funcional/operativa salvo que una prueba dependa específicamente de región.

## Gaps de paridad que sí aportan valor

Los controles de recovery, budget y observabilidad ya están cerrados en dev. No se vuelven a crear ni duplicar.

### Plataforma web estable de preprod

Se debe comprobar si `atlasmap-dev` ya tiene un Firebase Hosting site. Una URL estable de preprod aporta valor para:

- pruebas reales cross-browser/device;
- Google Auth fuera de localhost;
- App Check con reCAPTCHA Enterprise;
- pruebas de build/despliegue cercanas a producción.

No se crea Hosting hasta observar primero el inventario real.

### App Check en dev

Se preparará App Check en `atlasmap-dev` sin depender del dominio productivo definitivo.

- Para una URL de preprod estable se usará App Check + reCAPTCHA Enterprise.
- Para `localhost` se usará el mecanismo de debug token de Firebase App Check; `localhost` no se añadirá a los dominios permitidos de reCAPTCHA.
- debug tokens nunca se guardan en el repo ni se reutilizan en producción.
- enforcement se activa sólo después de observation y evidencia de tráfico legítimo.

La creación de Hosting/site key/registro/enforcement en cloud continúa siendo una mutación explícita y no queda autorizada por este documento.

### Firestore TTL

Las colecciones internas con `expiresAt` deben tener políticas TTL reales cuando corresponda. El inventario de plataforma revisa las ocho collection groups históricamente declaradas como expirables antes de crear ninguna policy, para evitar duplicados o asumir que el código de expiración equivale a TTL cloud activo.

### Concurrencia browser/device

Ya existen carga cloud y simulaciones multidevice/contención. Una prueba real en dos navegadores/dispositivos sigue siendo útil como evidencia preprod, especialmente antes de ampliar READ/WRITE productivo, pero no requiere inventar nueva infraestructura.

## Preflights de paridad

### Runtime + Phase K

```powershell
npm run storage-v4:dev:preprod-parity
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

### Plataforma web/seguridad

```powershell
npm run storage-v4:dev:platform-parity
```

También es read-only. Inventaría:

- Delete Protection y PITR de Firestore;
- Firebase Web Apps y Google Auth;
- Firebase Hosting sites;
- APIs/registro de App Check y reCAPTCHA Enterprise;
- Secret Manager, Remote Config e Identity Toolkit;
- TTL policies de las collection groups internas con expiración.

Devuelve una lista explícita de `gaps`; no crea recursos para hacer desaparecer el gap.

## Regla de mutaciones

`atlasmap-dev` puede recibir infraestructura real y datos sintéticos/controlados, pero cada operación cloud mutable continúa usando el token/confirmación de su runner correspondiente. `continúa` no sustituye aprobaciones de costo, IAM, enforcement, deploy o cambios destructivos cuando el runner ya las exige.

`atlasmap-prod` permanece congelado para desarrollo de funcionalidades hasta una decisión explícita de retomar Phase L.
