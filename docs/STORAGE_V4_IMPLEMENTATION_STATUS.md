# Atlas Storage v4 — implementation status

Fecha de corte: 2026-08-11

Este documento distingue el **roadmap original A–L** de los **rollout gates**. En particular, `Phase G` (delete/trash) no es `Gate G READ`.

## Resumen

| Roadmap | Estado | Evidencia / límite |
|---|---|---|
| A — schema/rules | Implementado y probado | Contrato v4, Rules y suites emulator existentes. |
| B — IndexedDB/drafts | Implementado | Persistencia local web, recuperación y contratos existentes. |
| C — dirty tracking | Implementado | Intent/mutation models y coalescing existentes. |
| D — Sync Coordinator | Implementado, no activado globalmente | Queue, lease/fencing, retry/backoff y lifecycle cubiertos por tests. |
| E — incremental persistence | Implementado | Escrituras por entidad/versionado, sin reescritura completa como happy path. |
| F — aggregates | Implementado en backend/tests | Modelo/event handler/store/triggers presentes; activación productiva pendiente. |
| G — delete/trash | Implementado en backend/tests | Soft-delete/lifecycle/purge/reconciliación presentes; activación productiva pendiente. |
| H — concurrency/conflicts | Implementado en contrato/tests | Entity-level conflict en v4.0; no merge complejo campo-a-campo. |
| I — migration | Implementado en código/tests | Materializer/verifier/rollback existentes; migración productiva no ejecutada. |
| J — provider cache separation | Preparado lógicamente; separación física pendiente | `cacheDb` centraliza temporales, `expiresAt` y resiliencia probados. `atlas-cache` físico espera acceso server-side aprobado para named DB. |
| K — monitoring/backups/load | En progreso avanzado | Recovery dev activo/verificado y 4/4 streams observados E2E. Bundle declarativo de dashboard/metrics/alerts preparado; falta aplicarlo/validarlo y cerrar budget/restore/load/resilience/SLOs. |
| L — production | Preparado, no iniciado | Runbook L0–L7 creado. Producción no se toca hasta completar recovery/cost/security gates. |

## Rollout Gate G READ

**PASS técnico en `atlasmap-dev`.**

Validado:

- Remote Config fail-closed;
- canal Remote Config Realtime observado;
- telemetría autenticada sin contenido sensible;
- Rules READ candidatas compatibles con CRUD v3;
- selector estable por UID;
- lectura real `repositoryMode=hybrid-read` con outcome exitoso;
- rollback final a fail-closed.

El PASS no autoriza `pilot`, write v4, migración productiva ni cambios de producción.

## Phase J — checkpoint pendiente

La frontera lógica ya separa `db` (canónico/interno) de `cacheDb` (temporales de proveedor), pero actualmente ambos apuntan a `(default)`.

No activar `atlas-cache` físicamente hasta disponer de un acceso server-side a named databases aprobado para producción, además de provisioning, deny-all cliente, TTL, IAM y smoke tests. Forzar una API marcada preview solo para cerrar el checklist introduciría riesgo sin beneficio funcional.

## Phase K — trabajo completado y evidencia real

Código/preparación:

- `storage_v4_rollout_metric` para comparación del repositorio READ validada E2E;
- `storage_v4_provider_cache_metric` para hit/miss/read-error/write-error sin key/query/result/UID;
- `storage_v4_provider_request_metric` para provider/operation/outcome/status/latencia sin URL, query string, API key, body ni respuesta;
- provider cache fail-soft ante errores de lectura/escritura y coalescing concurrente probados;
- lifecycle de sync expone métricas agregadas de flush y recuperación de cola sin IDs/payloads;
- callable `storageV4SyncTelemetry` + cliente bufferizado con contrato allowlist y rechazo de campos sensibles;
- modelo de capacidad parametrizable para 1k/10k/50k/100k usuarios sin fijar precios unitarios en código;
- simulación multidevice de conflicto entity-level preserva la edición perdedora explícitamente y evita pérdida silenciosa;
- runbook define SLOs iniciales, señales, alertas, dashboard, costos, PITR/backups, restore drill y pruebas de resiliencia;
- preflight read-only de recovery/billing/telemetría con fallback project-scoped para budgets;
- helper de deploy selectivo bloqueado a `atlasmap-dev` y diagnóstico read-only de Cloud Functions/Cloud Run/CORS;
- siete logs-based metric configs para counters y distribuciones de latencia;
- dashboard declarativo de Storage v4 con telemetría propia + Firestore + Cloud Run;
- tres alert policy templates de desarrollo, deshabilitados y sin notification channels;
- apply de observabilidad dev bloqueado a `atlasmap-dev`, dry-run por defecto, sin deletes/budgets/write-v4.

Evidencia `atlasmap-dev` del 2026-08-11:

- database `(default)` en `northamerica-south1`;
- billing habilitado;
- PITR **habilitado**;
- retención de versiones `604800s` (7 días);
- delete protection deshabilitado;
- un scheduled backup diario activo, creado `2026-08-11T21:51:35.104231Z`, con retención `604800s` (7 días);
- budget todavía no demostrado: el probe project-scoped obtuvo HTTP 403 con la identidad actual; no se interpreta como ausencia de budget;
- `storageV4SyncTelemetry` desplegada, `ACTIVE`, ingress `ALLOW_ALL`, Cloud Run invoker público y preflight CORS localhost `204`;
- `geoapifyCityAutocomplete` revalidada `ACTIVE` con la misma accesibilidad y con instrumentación provider cache/request desplegada;
- prueba real de city autocomplete produjo `cacheHit=false`, `results=1`;
- prueba autenticada de sync telemetry produjo `syncOk=true` sin activar Storage v4 WRITE;
- preflight de Cloud Logging a `2026-08-11T23:16:33Z`: **4/4 streams observados**;
- `storage_v4_rollout_metric` latest `2026-08-11T23:12:44.459781Z`;
- `storage_v4_sync_metric` latest `2026-08-11T23:13:12.100196Z`;
- `storage_v4_provider_cache_metric` latest `2026-08-11T23:13:11.223825Z`;
- `storage_v4_provider_request_metric` latest `2026-08-11T23:13:11.715676Z`.

El bundle declarativo de observabilidad existe en repo, pero **todavía no es evidencia cloud**: no declarar dashboard creado ni alertas operacionales hasta aplicarlo y verificarlo server-side. Los templates permanecen deshabilitados hasta medir baseline y aprobar notification channel/owner.

La evidencia completa está en `docs/STORAGE_V4_PHASE_K_EVIDENCE_2026-08-11.md`.

Todavía falta para cerrar K:

- aplicar y validar dashboard/log-based metrics/alert templates en dev;
- probar y después habilitar alertas con baseline y notification channels aprobados;
- budget configurado y observable;
- restore drill real usando un backup disponible;
- provider outage E2E;
- multidevice E2E de navegador/dispositivos reales además de la simulación determinista;
- carga/reconnect E2E y medición de SLO;
- aplicar precios vigentes y supuestos aprobados al modelo de costos.

## Phase L — regla de avance

No existe salto directo a producción. Orden mínimo:

1. L0 proyecto/ubicación;
2. L1 seguridad/datos;
3. L2 recovery/costo;
4. L3 App Check observación;
5. L4 READ productivo gradual;
6. L5 materialización/verificación;
7. L6 write v4 controlado;
8. L7 convergencia y retiro gradual de legado.

Mientras Functions permanezca en una versión donde `BooleanParam` no esté soportado explícitamente como `CallableOptions.enforceAppCheck`, mantener el valor literal validado y no reintroducir el patrón paramétrico que produjo 401.

## Criterio de "v4 completa"

No declarar Storage v4 completa hasta que:

- v4 sea canónico en producción;
- no exista dual-write permanente;
- migración/paridad/rollback estén cerrados;
- Sync/IndexedDB/concurrencia/delete/agregados hayan pasado evidencia productiva controlada;
- backups y restore drill estén probados;
- App Check esté estable según el rollout aprobado;
- observabilidad/costos/budgets estén operativos;
- provider cache esté físicamente aislado o exista una decisión explícita aprobada que sustituya esa topología;
- el camino v3 restante tenga retiro completado o condición/fecha explícita.
