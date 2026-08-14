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
| J — provider cache separation | **Lógica cerrada; física diferida** | `cacheDb`, TTL/freshness, provider policy y resiliencia probados. `atlas-cache` físico sigue bloqueado por el acceso named-database de Firebase Admin Node aún marcado Preview/no-production. |
| K — monitoring/backups/load | **Muy avanzado** | Recovery, restore drill, 4/4 streams, 7 métricas, dashboard, canal, provider outage, sync flush y closeout cloud PASS. Restan budget/thresholds, alertas representativas, load/reconnect cloud representativo, costo con supuestos aprobados y opcional multidevice navegador real. |
| L — production | **Preparado, no iniciado** | Runbook L0–L7. No tocar producción antes de cerrar decisiones operativas/costo/seguridad. |

## Avance global estimado

- **Implementación técnica v4:** ~97%.
- **Plan completo A–L hasta producción estable:** **~91%**.

El porcentaje restante está concentrado principalmente en decisiones y evidencia operacional/productiva, no en construir de nuevo la arquitectura.

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

## Phase J — decisión pendiente

La separación lógica ya obliga a que datos temporales/derivados de proveedor dependan de `cacheDb` y no del almacenamiento canónico.

Revalidación oficial realizada el **2026-08-14**:

- Firestore soporta múltiples databases por proyecto;
- Firebase Admin Node continúa marcando `getFirestore(databaseId)` y `getFirestore(app, databaseId)` como **Public Preview**;
- la referencia oficial sigue indicando no utilizar ese acceso named-database en producción.

Por eso no se fuerza `atlas-cache` físico. Para cerrar J productivamente se requiere una de dos cosas:

1. que el acceso server-side elegido deje de estar marcado no-production; o
2. aprobar explícitamente una topología sustituta/defer para v4.0 manteniendo la separación lógica ya implementada.

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

La ventana de rollout/provider sigue contaminada por pruebas intencionales de error, kill switch, config-unavailable y provider-outage; no usar su success rate agregado como baseline productivo.

### Monitoring

- exactamente 1 dashboard Atlas Storage v4 dev;
- 7/7 logs-based metrics;
- 3 alert policies existentes, todavía deshabilitadas;
- 1 canal email usable y asociado a las tres policies.

### Billing

- billing habilitado;
- Budget API habilitada y legible;
- permisos read-only verificados;
- account-scope y project-scope legibles;
- **budget count = 0**;
- no se inventa un monto ni thresholds.

### Resiliencia / carga

Cerrado:

- Provider Outage E2E real;
- reconnect/capacity determinista;
- multidevice/contención determinista;
- purge real aislado;
- migration/rollback cloud real;
- sync flush real.

Pendiente material para cerrar K:

1. aprobar/configurar budget mensual y thresholds;
2. convertir baseline representativo en thresholds y probar/habilitar alertas dev;
3. ejecutar una carga/reconnect **cloud representativa** con fixture controlado y cleanup;
4. alimentar el cost model con supuestos medidos o explícitamente aprobados;
5. si se mantiene como requisito productivo, obtener muestra de dos navegadores/dispositivos reales sobre mismo usuario.

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
