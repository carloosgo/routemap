# Atlas Storage v4 — implementation status

Fecha de corte: **2026-08-14**

Este documento distingue implementación técnica, evidencia dev y rollout productivo. `atlasmap-prod` ya existe; **L0 y L1 están cerrados**, pero producción todavía no sirve tráfico de aplicación ni tiene Storage v4 READ/WRITE habilitado.

## Resumen A–L

| Roadmap | Estado | Evidencia / límite |
|---|---|---|
| A — schema/rules | **Cerrado técnicamente** | Contrato v4, Rules estrictas y suites emulator. |
| B — IndexedDB/drafts | **Cerrado técnicamente** | Persistencia local web, recuperación y contratos. |
| C — dirty tracking | **Cerrado técnicamente** | Intent/mutation models y coalescing. |
| D — Sync Coordinator | **Implementado + E2E dev** | Queue, lease/fencing, retry/backoff, lifecycle y flush real observados; activación global pendiente de rollout. |
| E — incremental persistence | **Implementado + E2E dev** | Create/write v4 real, escritura por entidad/versionado y sync flush real. |
| F — aggregates | **Implementado + E2E dev** | Eventarc real de segment/note procesado; aggregate/touch backend observado. |
| G — delete/lifecycle/purge | **Cerrado en dev** | Delete real, UX anti-doble-click, purge job y purge físico aislado PASS. Restore público de viaje completo eliminado por diseño. |
| H — concurrency/conflicts | **Implementado/probado** | Contrato entity-level y simulaciones multidevice/contención. Muestra browser/device real queda como gate de rollout si se exige. |
| I — migration | **Cerrado en dev** | Round-trip cloud real `v3→v4→v3→v4` PASS. No hay migración masiva/productiva. |
| J — provider cache separation | **Cerrado para v4.0** | Separación lógica y resiliencia probadas; database física `atlas-cache` diferida mientras la vía server-side elegida siga no production-ready. |
| K — monitoring/backups/load | **Cerrado en dev** | Recovery, restore, telemetry, dashboard, alert firing real, budget dev, resiliencia, carga/reconnect y CI PASS. Forecast/latencia real pasan a gates productivos. |
| L0 — target productivo | **PASS productivo** | `atlasmap-prod` ACTIVE, billing ligado, Firebase enabled, Firestore `(default)` Standard/Native en `us-central1`, delete protection enabled. |
| L1 — seguridad/datos | **PASS productivo fail-closed** | Preflight PASS; Rules deny-all verificadas; 1 Web App productiva; Google Sign-In habilitado; otros providers y localhost deshabilitados. Firestore sigue sin tráfico/datos productivos. |
| L2 — recovery/costo | **Siguiente gate** | PITR/backups/restore drill, budget, observabilidad y forecast productivos. |
| L3–L7 — rollout | **Pendiente** | App Check, READ gradual, materialización, WRITE controlado y convergencia/retiro v3. |

## Avance global estimado

- **Implementación técnica v4:** ~99%.
- **Plan completo A–L hasta producción estable:** **~97.5%**.

El porcentaje restante está concentrado en recovery/costo productivo, App Check, rollout gradual, baseline real de latencia, activación WRITE y convergencia final. No se considera “terminado” por el porcentaje: los gates L4–L7 siguen siendo de alto impacto operativo.

## Entornos

### Desarrollo

```text
Firebase/GCP project: atlasmap-dev
Firestore: (default)
Location: northamerica-south1
```

A–K tienen evidencia dev real. Remote Config/pilot, Eventarc, Functions, observabilidad, restore, carga y budget dev no deben extrapolarse como configuración productiva automática.

### Producción

```text
Firebase/GCP project: atlasmap-prod
Firebase alias: prod
Firestore: (default)
Location: us-central1
Mode: FIRESTORE_NATIVE
Edition: STANDARD
Delete protection: enabled
PITR: pendiente de L2
Firebase Web App: AtlasMap Web Production
Firestore client Rules: deny-all
Google Authentication: enabled
Email/password: disabled
Anonymous Auth: disabled
Phone Auth: disabled
localhost authorized: false
```

L0 bootstrap PASS:

```text
project-ready   -> already-present / ACTIVE
billing-ready   -> already-linked
apis-ready      -> firebase.googleapis.com + firestore.googleapis.com
firebase-ready  -> enabled; quota-project header applied
firestore-ready -> created in us-central1; delete protection enabled
L0              -> pass: true
```

El estado `already-present/already-linked` se debe a la reanudación idempotente de un intento anterior que alcanzó esas etapas antes de fallar en Firebase Management por quota-project. El runner fue corregido sin modificar ADC global.

Evidencia L0: `docs/STORAGE_V4_PHASE_L0_CLOSEOUT_2026-08-14.md`.

`.firebaserc` conserva `default` en dev y agrega solo el alias explícito `prod -> atlasmap-prod`. Ningún runner productivo debe depender del alias `default`.

## Invariantes de producción vigentes

En este punto:

- existe exactamente 1 Firebase Web App productiva creada por este rollout: `AtlasMap Web Production`;
- Firestore client Rules están en baseline `deny-all` y el source server-side fue verificado;
- Google Sign-In está habilitado y el OAuth client/secret existen server-side;
- email/password, anonymous y phone permanecen deshabilitados;
- `localhost` no está autorizado;
- no se han desplegado Functions/Eventarc productivos;
- no se ha configurado Remote Config productivo;
- no se ha habilitado App Check productivo;
- no se ha habilitado Storage v4 READ/WRITE productivo;
- no se han migrado usuarios/viajes productivos;
- PITR, backup schedule y restore drill productivos esperan L2;
- no se declara baseline de latencia productiva todavía.

## A–K dev — evidencia clave

### Delete/lifecycle

El delete de viaje es **definitivo para el usuario**. No existe opción de restore en UI ni API pública/backend de restore de viaje completo. La eliminación lógica + purge asíncrono permanece como mecanismo operacional interno.

### Migración

El round-trip real dev pasó:

```text
v3 -> v4 -> rollback v3 -> v4
```

Esto valida materialización/verificación/rollback/re-ejecución, no autoriza migración productiva masiva.

### Phase J

La separación lógica de cache de proveedor es obligatoria en v4.0. La separación física `atlas-cache` se reabre cuando exista una vía server-side production-ready aprobada.

Decisión: `docs/STORAGE_V4_PHASE_J_DECISION_2026-08-14.md`.

### Phase K

Closeout: `docs/STORAGE_V4_PHASE_K_CLOSEOUT_2026-08-14.md`.

Dev confirmó:

- PITR 7 días + backup diario 7 días;
- restore drill + cleanup PASS;
- 4/4 streams de telemetría y 7/7 logs-based metrics;
- dashboard Atlas;
- 3/3 alert policies permanentes habilitadas;
- alert-delivery drill: incidente real `OPEN` observado y policy temporal limpiada;
- asociación de notification channel PASS; recepción humana del email no declarada;
- budget `Atlas Storage v4 dev`: **500 MXN/mes**, thresholds **50/80/100%**;
- provider outage E2E PASS;
- sync flush real PASS;
- migration/rollback/remigration PASS;
- purge aislado real PASS;
- carga cloud 120 hijos PASS;
- reconnect 60/60 updates PASS;
- simulaciones de multidevice/contención PASS.

Las latencias del stress drill dev prueban robustez funcional, no un SLO productivo. La aceptación/tuning se toma con tráfico/browser real en L4/L6.

El cost model existe con clasificación `simulation | measured | approved`. No hay defaults de producto que fabriquen un forecast. Un forecast productivo requiere supuestos medidos o explícitamente aprobados en L2.

## L1 — seguridad/datos — CLOSED

L1 se cerró fail-closed.

### Preflight inicial — PASS

Se verificó en `atlasmap-prod`:

1. proyecto ACTIVE;
2. billing enabled;
3. Firestore `(default)` en `us-central1`, Standard/Native y delete protection;
4. **0 colecciones top-level**;
5. **0 Firebase Web Apps** antes del bootstrap;
6. ninguna mutación de Rules, IAM, Auth, Functions o datos durante el preflight.

Evidencia: `docs/STORAGE_V4_PHASE_L1_PREFLIGHT_2026-08-14.md`.

### Firestore Rules locked — PASS

`firestore.l1.prod.locked.rules` fue desplegada y el release activo se verificó server-side. El contrato efectivo es:

```text
allow read, write: if false;
```

No existía release Firestore previo en este proyecto recién creado, por lo que `previousReleaseName`/`previousRulesetName` fueron `null`; no había rollback pointer anterior que preservar.

Evidencia: `docs/STORAGE_V4_PHASE_L1_RULES_LOCK_2026-08-14.md`.

### Firebase Web App — PASS

Se creó exactamente una Web App:

```text
displayName: AtlasMap Web Production
webAppCountObserved: 1
sdkConfigProjectMatches: true
```

El runner no imprimió API key ni escribió `.env`. Firestore Rules permanecieron locked; Auth/IAM/Functions/datos no cambiaron en ese paso.

Evidencia: `docs/STORAGE_V4_PHASE_L1_WEB_APP_2026-08-14.md`.

### Google Authentication — PASS

Apply productivo observado:

```text
googleSignInEnabled: true
googleOAuthClientPresent: true
googleOAuthSecretPresent: true
emailPasswordEnabled: false
anonymousEnabled: false
phoneEnabled: false
localhostAuthorized: false
```

El correo de soporte fue input explícito; las credenciales OAuth no se imprimieron. Firestore Rules permanecieron deny-all y no se mutaron datos de aplicación.

Evidencia: `docs/STORAGE_V4_PHASE_L1_GOOGLE_AUTH_2026-08-14.md`.

### Criterio de cierre L1

Los contratos funcionales v4 ya pasan Emulator: ownership/aislamiento entre usuarios, shapes/límites, timestamps, versionado, tombstones y bloqueo de colecciones internas. Producción permanece más restrictiva (`deny-all`) hasta abrir READ en L4 y WRITE en L6.

Closeout: `docs/STORAGE_V4_PHASE_L1_CLOSEOUT_2026-08-14.md`.

## Orden restante de Phase L

1. **L2 — recovery + costo:** PITR/backups/restore drill/budget productivos + forecast aprobado;
2. **L3 — App Check:** observación antes de enforcement;
3. **L4 — READ productivo gradual:** baseline real de latencia/errores;
4. **L5 — materialización/verificación:** v3→v4 sin hacer v4 canónico todavía;
5. **L6 — WRITE v4 controlado:** cohortes, conflictos/multidevice y kill-switch;
6. **L7 — convergencia:** v4 canónico y retiro completo/fechado de v3.

La arquitectura se declara estable en producción únicamente cuando v4 sea canónico, no exista dual-write permanente, recovery/observabilidad/costos/App Check estén operativos y el camino v3 tenga retiro completo o una condición/fecha explícita.
