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
| H — concurrency/conflicts | **Implementado/probado** | Contrato entity-level, simulaciones multidevice/contención y protección contra fallback destructivo v4→v3. Falta únicamente una muestra multi-browser/device real si se exige como gate productivo. |
| I — migration | **Cerrado en dev** | Materializer/verifier/rollback + round-trip cloud real `v3→v4→v3→v4` PASS. No hay migración masiva/productiva. |
| J — provider cache separation | **Cerrado para v4.0** | Separación lógica, `cacheDb`, TTL/freshness, provider policy y resiliencia probados. La database física `atlas-cache` se difiere mientras Firebase Admin Node mantenga named-database access como Preview/no-production. |
| K — monitoring/backups/load | **Cierre operacional dev** | Recovery, restore drill, 4/4 streams, 7 métricas, dashboard, canal, 3 policies permanentes habilitadas, budget dev MXN, provider outage, sync flush, purge/migration closeout, carga/reconnect cloud y CI completo PASS. Resta observar el firing del drill temporal y cerrar cost assumptions/latencia para el gate productivo. |
| L — production | **Preparado, no iniciado** | Runbook L0–L7. No tocar producción antes de cerrar decisiones operativas/costo/seguridad. |

## Avance global estimado

- **Implementación técnica v4:** ~99%.
- **Plan completo A–L hasta producción estable:** **~94%**.

El porcentaje restante está concentrado principalmente en evidencia operacional final y rollout productivo, no en construir de nuevo la arquitectura.

## Pilot WRITE dev — evidencia real cerrada

En `atlasmap-dev` ya se validó una cadena real de punta a punta:

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

El primer viaje sintético que cayó por v3 permitió detectar el bug de mode-flip. La corrección bloquea mutaciones cuando Remote Config queda no resuelto en vez de degradar silenciosamente a v3. Un segundo viaje sintético confirmó creación v4 real.

El delete quedó definido como **irreversible para el usuario**. El backend público de lifecycle ya no acepta restore de viaje completo. La retención previa a purge es únicamente operacional.

Evidencia consolidada: `docs/STORAGE_V4_DEV_CLOSEOUT_2026-08-14.md`.

## Migración real dev

La evidencia ya no es solo emulator/unit:

```text
v3 real retenido
 -> migrate
 -> v4 complete/version=1
 -> rollback real
 -> v3 restored
 -> remigrate
 -> v4 complete/version=1
```

El round-trip completo pasó en `atlasmap-dev`. Esto prueba materialización, verificación, commit, rollback y reejecución sobre cloud real. No autoriza todavía migración masiva ni producción.

## Phase J — decisión cerrada para v4.0

La separación lógica obliga a que datos temporales/derivados de proveedor dependan de `cacheDb` y no del almacenamiento canónico.

Revalidación oficial realizada el **2026-08-14**:

- Firestore soporta múltiples databases por proyecto;
- Firebase Admin Node continúa marcando `getFirestore(databaseId)`, `getFirestore(app, databaseId)` e `initializeFirestore(..., databaseId)` como **Public Preview**;
- la referencia oficial sigue indicando no utilizar ese acceso named-database en producción.

Por lo tanto, v4.0 **no fuerza `atlas-cache` físico** ni queda bloqueado esperando una API no-production. La separación física se reabrirá cuando el acceso server-side sea production-ready o exista una alternativa estable aprobada. La decisión detallada queda en `docs/STORAGE_V4_PHASE_J_DECISION_2026-08-14.md`.

## Phase K — estado actualizado

### Recovery

- `(default)` en `northamerica-south1`;
- PITR habilitado, 7 días;
- backup diario, retención 7 días;
- múltiples backups `READY`;
- restore drill real PASS y cleanup PASS;
- último checkpoint confirmó 0 bases temporales de restore existentes.

### Telemetría / SLO

4/4 streams visibles:

- rollout;
- sync;
- provider cache;
- provider request.

El checkpoint del 2026-08-14 confirmó **5 flush reales, 5/5 success**, p50 154 ms y p95/p99 878 ms en esa muestra. El requisito antes pendiente de tener señal `sync flush` real queda cerrado.

La ventana de rollout/provider sigue contaminada por pruebas intencionales de error, kill switch, config-unavailable, provider-outage y drills sintéticos; no usar su success rate agregado como baseline productivo.

### Monitoring

- exactamente 1 dashboard Atlas Storage v4 dev;
- 7/7 logs-based metrics;
- **3/3 alert policies permanentes habilitadas** en `atlasmap-dev`;
- thresholds y asociaciones de canal permanecieron sin cambios durante la activación;
- 1 canal email usable y asociado a las tres policies;
- runner guardado para enable/disable controlado de policies dev;
- runner `phase-k:observability:alert-delivery-drill-dev` crea una policy temporal, emite una señal sintética `sync unexpected-error`, intenta observar el incidente de Cloud Monitoring y borra la policy en `finally` sin modificar las tres policies permanentes.

Los dos primeros intentos del drill fallaron de forma segura antes de probar el firing: el primero por transporte `gcloud logging write` bajo una ruta Windows con espacios; el segundo después de escribir correctamente la señal, al consultar `projects.alerts.list` con una petición que devolvió HTTP 400. Ambos confirmaron cleanup de la policy temporal. El runner actual elimina el `orderBy` redundante —la API ya ordena por `openTime desc` por defecto— y muestra el mensaje seguro del API si vuelve a fallar. Su CI está verde; falta una nueva ejecución cloud.

### Billing

- billing habilitado;
- Budget API habilitada y legible;
- permisos de create/list confirmados;
- existe exactamente **1 budget project-scoped** para `atlasmap-dev`;
- display name: `Atlas Storage v4 dev`;
- monto: **500 MXN/mes**;
- thresholds aprobados/aplicados: **50%, 80% y 100%**;
- el apply no tocó IAM, datos de aplicación, Storage v4 write ni producción;
- el runner fue endurecido después para exigir `--amount` y `--thresholds` explícitos en futuras creaciones, evitando defaults financieros silenciosos.

### Resiliencia / carga

Cerrado funcionalmente en dev:

- Provider Outage E2E real;
- reconnect/capacity determinista;
- multidevice/contención determinista;
- purge real aislado;
- migration/rollback cloud real;
- sync flush real;
- carga/reconnect cloud real con fixture de 120 hijos, 10 hydrates y 60 updates: **60/60 success, 0 failures, aggregates convergentes y cleanup PASS**.

Mediciones del drill cloud de carga/reconnect:

- creación de 120 hijos: 751 ms;
- aggregate convergence inicial: 31,666 ms;
- hydrate p50: 2,746 ms; p95/p99: 17,872 ms;
- reconnect write p50: 4,187 ms; p95: 5,644 ms; p99: 5,817 ms;
- aggregate convergence después del reconnect: 17,869 ms.

Estas mediciones cierran la **robustez funcional** del escenario, no un SLO productivo. Las latencias quedan como señal real para aceptación/tuning antes del rollout productivo. Evidencia: `docs/STORAGE_V4_PHASE_K_CLOUD_LOAD_2026-08-14.md`.

### CI

El HEAD `ab10be7a60656af63559055cbb57a8852bde5ba0` cerró el checkpoint posterior al segundo hardening del alert-delivery drill:

- unit tests PASS;
- Firestore Rules suite PASS;
- Phase K scoped Rules PASS;
- ESLint PASS;
- production build PASS;
- Dependency audit PASS;
- CodeQL PASS.

Durante este cierre se corrigieron inconsistencias reales de lifecycle, lint, budget y transporte/polling del drill de alertas, manteniendo cleanup fail-safe y los límites exclusivos de `atlasmap-dev`.

Pendiente material para cerrar K/preparar L:

1. ejecutar de nuevo el drill temporal y observar un incidente real de Cloud Monitoring;
2. alimentar el cost model con supuestos medidos o explícitamente aprobados; mientras no existan, solo se permiten simulaciones claramente etiquetadas;
3. trasladar la aceptación/tuning de las latencias del stress drill al gate de rollout productivo, sin confundir robustez funcional con SLO;
4. si se mantiene como requisito productivo, obtener muestra de dos navegadores/dispositivos reales sobre mismo usuario durante L4/L6.

## Phase L — regla de avance

Orden de producción:

1. L0 proyecto/ubicación;
2. L1 seguridad/datos;
3. L2 recovery/costo;
4. L3 App Check observación;
5. L4 READ productivo gradual;
6. L5 materialización/verificación;
7. L6 WRITE v4 controlado;
8. L7 convergencia y retiro de v3.

No existe salto directo. La arquitectura queda declarada completa solo cuando v4 sea canónico en producción, no exista dual-write permanente, migración/rollback estén cerrados, observabilidad/costos/budget estén operativos, App Check esté estable y el camino v3 tenga retiro completo o fecha/condición explícita.
