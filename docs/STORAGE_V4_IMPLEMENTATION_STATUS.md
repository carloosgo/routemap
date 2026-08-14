# Atlas Storage v4 — implementation status

Fecha de corte: **2026-08-14**

Este documento distingue el roadmap original A–L de los rollout gates. Producción sigue intacta; la evidencia de activación real descrita aquí corresponde a `atlasmap-dev`.

## Resumen A–L

| Roadmap | Estado | Evidencia / límite |
|---|---|---|
| A — schema/rules | **Cerrado técnicamente** | Contrato v4, Rules estrictas y suites emulator. |
| B — IndexedDB/drafts | **Cerrado técnicamente** | Persistencia local web, recuperación y contratos. |
| C — dirty tracking | **Cerrado técnicamente** | Intent/mutation models y coalescing. |
| D — Sync Coordinator | **Implementado + E2E dev** | Queue, lease/fencing, retry/backoff, lifecycle y flush real observados; activación global pendiente de rollout. |
| E — incremental persistence | **Implementado + E2E dev** | Create/write v4 real, escritura por entidad/versionado y sync flush real. |
| F — aggregates | **Implementado + E2E dev** | Eventarc real de segment/note procesado; aggregate/touch backend observado. |
| G — delete/lifecycle/purge | **Cerrado en dev** | Delete real desde cliente, `deleted/version+1`, purge job real, UX anti-doble-click, restore de viaje eliminado removido, purge físico aislado real PASS. |
| H — concurrency/conflicts | **Implementado/probado** | Contrato entity-level y simulaciones multidevice/contención. La muestra multi-browser real queda como gate de rollout si se exige. |
| I — migration | **Cerrado en dev** | Materializer/verifier/rollback + round-trip cloud real `v3→v4→v3→v4` PASS. No hay migración masiva/productiva. |
| J — provider cache separation | **Cerrado para v4.0** | Separación lógica, `cacheDb`, TTL/freshness, provider policy y resiliencia probados. `atlas-cache` físico queda diferido mientras named-database server-side siga Preview/no-production. |
| K — monitoring/backups/load | **Cerrado en dev** | Recovery, restore, telemetry, dashboard, 3 alert policies habilitadas, firing real de incidente, budget MXN, resiliencia, carga/reconnect y CI PASS. Forecast aprobado/latencia real pasan a gates L2/L4/L6. |
| L — production | **Preparado, no iniciado** | Runbook L0–L7. Producción no se toca sin aprobación explícita. |

## Avance global estimado

- **Implementación técnica v4:** ~99%.
- **Plan completo A–L hasta producción estable:** **~95%**.

La arquitectura y sus capacidades A–K están cerradas en desarrollo. El porcentaje restante está concentrado en la entrada controlada a producción, observación real y convergencia/retiro de v3.

## Pilot WRITE dev — evidencia real

En `atlasmap-dev` se validó una cadena real:

```text
Remote Config pilot
  -> browser repositoryMode=v4-pilot
  -> CREATE v4 real
  -> root schemaVersion=4/version=1
  -> segment + note v4
  -> Eventarc segment/note
  -> aggregate/touch backend
  -> DELETE real desde UI
  -> root deleted/version=2
  -> purge job scheduled
  -> purge físico real en fixture aislado
```

El bug de mode-flip detectado con el primer viaje sintético quedó corregido: una Remote Config no resuelta ya no degrada silenciosamente a v3. El delete es **irreversible para el usuario** y el backend público lifecycle no acepta restore de viaje completo.

Evidencia consolidada: `docs/STORAGE_V4_DEV_CLOSEOUT_2026-08-14.md`.

## Migración real dev

```text
v3 real retenido
 -> migrate
 -> v4 complete/version=1
 -> rollback real
 -> v3 restored
 -> remigrate
 -> v4 complete/version=1
```

El round-trip pasó en cloud real. Esto prueba materialización, verificación, commit, rollback y reejecución, sin autorizar migración masiva ni productiva.

## Phase J — cerrada para v4.0

La separación lógica obliga a que los datos temporales/derivados de proveedor dependan de `cacheDb` y no del almacenamiento canónico.

La database física `atlas-cache` no se fuerza mientras el acceso named-database server-side elegido continúe marcado Preview/no-production. v4.0 no queda bloqueado esperando esa API; la separación física se reabrirá cuando exista una vía production-ready o una alternativa estable aprobada.

Decisión: `docs/STORAGE_V4_PHASE_J_DECISION_2026-08-14.md`.

## Phase K — cerrada en dev

Closeout formal: `docs/STORAGE_V4_PHASE_K_CLOSEOUT_2026-08-14.md`.

### Recovery

- `(default)` en `northamerica-south1`;
- PITR 7 días;
- backup diario con retención 7 días;
- backups `READY` observados;
- restore drill real PASS;
- cleanup PASS;
- 0 bases temporales de restore remanentes en el checkpoint posterior.

### Telemetría / monitoring

- 4/4 streams estructurados visibles: rollout, sync, provider cache y provider request;
- 7/7 logs-based metrics;
- exactamente 1 dashboard Atlas Storage v4 dev;
- 1 notification channel email Atlas usable;
- **3/3 alert policies permanentes habilitadas** en `atlasmap-dev`;
- thresholds y asociaciones de canal no cambiaron durante el enable.

### Alert firing real

El tercer alert-delivery drill pasó de punta a punta:

- policy temporal: `projects/atlasmap-dev/alertPolicies/585442893147313324`;
- drill id: `phase-k-alert-drill-006e3a5e`;
- señal sintética `storage_v4_sync_metric`, `flush / unexpected-error`;
- incidente observado: `projects/atlasmap-dev/alerts/0.obfox9g5rsxe`;
- estado observado: `OPEN`;
- open time: `2026-08-14T20:47:46Z`;
- metric: `logging.googleapis.com/user/atlas_storage_v4_sync_events`;
- notification channel asociado: PASS;
- cleanup de policy temporal: PASS;
- policies permanentes, app data y producción: intactos.

`emailReceiptVerifiedInBand=false`: no se declara verificada la recepción humana del correo. Sí queda probada la cadena server-side hasta incidente y asociación de canal.

Evidencia: `docs/STORAGE_V4_PHASE_K_ALERT_DELIVERY_2026-08-14.md`.

### Billing

- billing habilitado;
- Budget API legible;
- permisos create/list confirmados;
- exactamente 1 budget project-scoped para `atlasmap-dev`;
- display name: `Atlas Storage v4 dev`;
- monto: **500 MXN/mes**;
- thresholds: **50%, 80%, 100%**;
- aplicación sin cambios a IAM, datos, Storage v4 WRITE ni producción;
- los runners posteriores exigen amount y thresholds explícitos para evitar defaults financieros silenciosos.

### Resiliencia / carga

- provider outage E2E real: PASS;
- sync flush real: PASS;
- migration/rollback/remigration: PASS;
- purge real aislado: PASS;
- reconnect/capacity determinista: PASS;
- multidevice/contención determinista: PASS;
- fixture cloud de 120 hijos: PASS;
- reconnect de 60 updates: **60/60 success**;
- aggregates convergentes;
- cleanup PASS.

Stress drill observado:

- creación de 120 hijos: 751 ms;
- aggregate convergence inicial: 31,666 ms;
- hydrate p50: 2,746 ms; p95/p99: 17,872 ms;
- reconnect write p50: 4,187 ms; p95: 5,644 ms; p99: 5,817 ms;
- aggregate convergence post-reconnect: 17,869 ms.

Estas cifras prueban robustez funcional, no un SLO productivo. La aceptación/tuning con usuarios/browser reales pasa a L4/L6.

### Cost model

El modelo queda implementado con escenarios 1k/10k/50k/100k, price book explícito, Geoapify por tier y clasificación `simulation | measured | approved`. No existen defaults de producto para fabricar un forecast.

Un forecast productivo exige supuestos medidos o explícitamente aprobados —sesiones, reads/mutations, cache hit, storage por usuario y costos no lineales—. Esa aprobación se convierte en requisito de **L2**, antes de tráfico productivo significativo; no se inventan cifras para cerrar K.

### CI

El bloque A–K exige y mantiene:

- unit tests PASS;
- Firestore Rules PASS;
- Phase K scoped Rules PASS;
- ESLint PASS;
- production build PASS;
- Dependency audit PASS;
- CodeQL PASS.

Los últimos hardenings corrigieron el test heredado de restore, inconsistencias de lint/budget, transporte Windows del drill y polling de incidentes. El firing cloud posterior confirmó el runner corregido.

## Phase L — siguiente bloque

Orden:

1. **L0 — proyecto/ubicación productivos**;
2. **L1 — seguridad/datos**;
3. **L2 — recovery + costo/forecast aprobado**;
4. **L3 — App Check observación**;
5. **L4 — READ productivo gradual + baseline de latencia**;
6. **L5 — materialización/verificación**;
7. **L6 — WRITE v4 controlado + evidencia multidevice si aplica**;
8. **L7 — convergencia y retiro de v3**.

El repo solo tiene configurados los aliases Firebase `default` y `dev`, ambos apuntando a `atlasmap-dev`. Por tanto L0 debe ser fail-closed: no se inventa ni infiere un project ID productivo y ninguna mutación productiva se ejecuta hasta que exista un target explícito y aprobado.

La arquitectura se declara estable en producción únicamente cuando v4 sea canónico, no exista dual-write permanente, observabilidad/costos/App Check estén operativos y el camino v3 tenga retiro completo o condición/fecha explícita.