# Atlas Storage v4 — App Check dev runbook

Fecha de referencia: 2026-08-16  
Proyecto objetivo: `atlasmap-dev`  
Producción protegida: `atlasmap-prod`

## Propósito

Este runbook separa explícitamente cuatro estados que no deben confundirse:

1. **Infraestructura registrada**: APIs, reCAPTCHA Enterprise y Web App App Check existen.
2. **Cliente capaz de emitir tokens**: Firebase Web SDK y Google Maps JavaScript disponen del wiring App Check.
3. **Observación**: servicios en `UNENFORCED`; se recogen métricas sin rechazar tráfico.
4. **Enforcement**: sólo después de revisar métricas reales; inválidos/faltantes pueden ser rechazados.

La paridad de plataforma puede estar verde sin que el enforcement esté activo.

## Invariantes

- Todos los runners están hard-bound a `atlasmap-dev`.
- `atlasmap-prod` no se modifica desde este flujo.
- Ningún `--apply` se ejecuta por continuidad implícita; requiere confirmación exacta.
- Replay protection de callable Functions permanece deshabilitado.
- El piloto Storage v4 dev de 0.01% no se apaga como efecto lateral de App Check.
- Hosting, service enforcement y Functions enforcement son gates separados.
- Los lectores de métricas nunca deciden automáticamente que es seguro activar enforcement.

## Estado alcanzado

### A. Bootstrap — cerrado

Ya aplicado en dev:

- `firebaseappcheck.googleapis.com` habilitada.
- `recaptchaenterprise.googleapis.com` habilitada.
- key reCAPTCHA Enterprise SCORE creada.
- dominio permitido exacto: `atlasmap-dev.web.app`.
- Web App `atlas web dev` registrada en App Check.
- token TTL: `3600s`.
- enforcement no activado.

Runner:

```powershell
node scripts/runStorageV4DevAppCheckBootstrap.mjs
```

Apply gated histórico:

```powershell
node scripts/runStorageV4DevAppCheckBootstrap.mjs --apply --confirm=ENABLE-ATLAS-DEV-APP-CHECK-BOOTSTRAP
```

## B. Cliente + Hosting

El primer deploy de Hosting con Firebase App Check ya se realizó y quedó verificado, pero posteriormente se añadió el wiring requerido para Google Maps JavaScript:

- `firebaseClient.js` expone una única instancia compartida de App Check.
- `googleMapsLoader.js` configura `google.maps.Settings.getInstance().fetchAppCheckToken`.
- el token se obtiene con `getToken(appCheck, false)`.

Por eso **debe hacerse un segundo deploy B** antes de habilitar monitoring de Maps.

Dry-run:

```powershell
node scripts/runStorageV4DevAppCheckClientDeploy.mjs
```

El runner exige que el bundle construido contenga simultáneamente:

- site key App Check dev;
- `atlasmap-dev`;
- ausencia de `atlasmap-prod`;
- wiring `fetchAppCheckToken` de Google Maps.

Y vuelve a comprobar esas condiciones sobre el bundle servido por Hosting.

Apply gated:

```powershell
node scripts/runStorageV4DevAppCheckClientDeploy.mjs --apply --confirm=DEPLOY-ATLAS-DEV-APP-CHECK-CLIENT
```

Este gate no modifica App Check enforcement, Functions, Firestore Rules ni Auth providers.

## C. Monitoring-only de servicios

Servicios objetivo:

- `firestore.googleapis.com`
- `identitytoolkit.googleapis.com`
- `maps-backend.googleapis.com`

Estado objetivo: `UNENFORCED`, replay protection `OFF`.

Dry-run:

```powershell
node scripts/runStorageV4DevAppCheckMonitoring.mjs
```

El runner bloquea Maps si el Hosting real todavía no evidencia `fetchAppCheckToken`.

Apply gated:

```powershell
node scripts/runStorageV4DevAppCheckMonitoring.mjs --apply --confirm=ENABLE-ATLAS-DEV-APP-CHECK-MONITORING
```

`UNENFORCED` es observación: recoge verificación App Check sin rechazar solicitudes por tokens inválidos/faltantes.

## D. Evidencia antes de enforcement

Después de habilitar monitoring, generar tráfico real desde `https://atlasmap-dev.web.app`:

- autenticación;
- lecturas/escrituras Firestore permitidas por el piloto;
- carga/uso del mapa;
- operaciones que invoquen callable Functions.

### Firestore / Auth / Maps

```powershell
node scripts/runStorageV4DevAppCheckMetrics.mjs --minutes=60
```

El checkpoint lee `firebaseappcheck.googleapis.com/services/verification_count` y reporta, entre otros:

- `VALID`
- `CONSUMED`
- `INVALID`
- `MISSING_OUTDATED_CLIENT`
- `MISSING_UNKNOWN_ORIGIN`
- porcentaje verificado
- tráfico observado por servicio

No tiene `--apply`.

### Callable Functions

```powershell
node scripts/runStorageV4DevFunctionsAppCheckMetrics.mjs --minutes=60
```

El checkpoint lee logs `callable-request-verification` y separa:

- `VALID`
- `INVALID`
- `MISSING`
- `UNKNOWN`

También muestra qué callables esperados tuvieron o no tuvieron tráfico.

No tiene `--apply`.

## E. Enforcement de Firestore / Auth / Maps

No ejecutar hasta revisar la evidencia de D.

Dry-run:

```powershell
node scripts/runStorageV4DevAppCheckEnforcement.mjs
```

Apply exige dos barreras deliberadas:

```powershell
node scripts/runStorageV4DevAppCheckEnforcement.mjs --apply --ack-metrics-reviewed --confirm=ENFORCE-ATLAS-DEV-APP-CHECK
```

Rollback a monitoring-only:

```powershell
node scripts/runStorageV4DevAppCheckEnforcement.mjs --rollback --apply --confirm=ROLLBACK-ATLAS-DEV-APP-CHECK
```

El enforcement sólo parte de `UNENFORCED`; el rollback vuelve a `UNENFORCED` y replay protection sigue `OFF`.

## F. Callable Functions

Existe un manifest canónico de 18 callable Functions en `functions/callableManifest.js`.

`storageV4ProviderOutageProbe` es `onRequest`, no callable, y está fuera de este gate.

La política central usa:

- parámetro `ENFORCE_APP_CHECK`;
- default `false`;
- `consumeAppCheckToken: false`.

Un override individual no puede saltarse el switch central.

### Pre-enforcement evidence

Usar primero el checkpoint read-only de Functions descrito en D.

### Dry-run del deploy de enforcement

```powershell
node scripts/runStorageV4DevFunctionsAppCheckEnforcement.mjs
```

El precheck exige que los 18 callables ya existan en `atlasmap-dev`; no crea callables faltantes como efecto colateral.

Los despliega en dos lotes de 9 y sólo modifica temporalmente `functions/.env.atlasmap-dev` para inyectar `ENFORCE_APP_CHECK`; el archivo original se restaura en `finally`.

### Apply

Sólo después de revisar métricas:

```powershell
node scripts/runStorageV4DevFunctionsAppCheckEnforcement.mjs --apply --ack-metrics-reviewed --confirm=ENFORCE-ATLAS-DEV-FUNCTIONS-APP-CHECK
```

Rollback:

```powershell
node scripts/runStorageV4DevFunctionsAppCheckEnforcement.mjs --rollback --apply --confirm=ROLLBACK-ATLAS-DEV-FUNCTIONS-APP-CHECK
```

## Orden obligatorio restante

1. Sincronizar repo local.
2. Dry-run B.
3. Apply B con confirmación explícita.
4. Dry-run C.
5. Apply C con confirmación explícita.
6. Generar tráfico real dev.
7. Leer métricas de servicios y Functions.
8. Revisar resultados manualmente.
9. Sólo si la evidencia es suficiente: dry-run de enforcement.
10. Apply de enforcement con confirmaciones separadas.
11. Validar funcionalidad y conservar rollback disponible.

## Qué no significa este runbook

- No autoriza cambios en producción.
- No autoriza automáticamente enforcement.
- No convierte ausencia de tráfico en señal verde.
- No convierte `fullPlatformParityReady=true` en evidencia de tokens válidos end-to-end.
- No activa replay protection.
