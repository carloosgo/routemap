# Atlas Storage v4 — implementation status

Fecha de corte: 2026-08-12

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
| J — provider cache separation | Preparado lógicamente; separación física pendiente | `cacheDb` centraliza temporales, `expiresAt` y resiliencia probados. `atlas-cache` físico sigue bloqueado porque el acceso a named Firestore mediante Firebase Admin Node continúa marcado Public Preview/no-production en la referencia oficial vigente al 2026-08-12. |
| K — monitoring/backups/load | En progreso avanzado | Recovery + cleanup, 4/4 streams y observabilidad Cloud dev verificados. Budget ya es legible y se confirmó que actualmente hay 0 budgets; dashboard/metrics/policies quedaron consistentes y el inventario de notification channels confirmó 0 canales. Falta aprobar budget, canal/thresholds y completar E2E/load/SLO representativo. |
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

Revalidación oficial realizada el `2026-08-12`:

- Firestore soporta múltiples bases y clientes conectados a named databases;
- en Firebase Admin SDK para Node, `getFirestore(databaseId)` / `getFirestore(app, databaseId)` continúa marcado **Public Preview**;
- la propia referencia oficial indica no usar esa API en producción.

Por tanto, no activar `atlas-cache` físicamente hasta disponer de un acceso server-side a named databases aprobado para producción, además de provisioning, deny-all cliente, TTL, IAM y smoke tests. Forzar una API preview solo para cerrar el checklist introduciría riesgo sin beneficio funcional.

## Phase K — evidencia real acumulada

Código/preparación:

- telemetría rollout/sync/provider cache/provider request con contratos allowlist;
- el composition root de sync v4 acepta un `syncTelemetryEmitter` opcional y conecta sus métricas de lifecycle sin activar WRITE por sí mismo; el cleanup de la composición también vacía/detiene el emitter en modo best-effort;
- provider cache fail-soft y coalescing;
- modelo de capacidad/costos parametrizable para 1k/10k/50k/100k usuarios;
- snapshot fechado de precios públicos Firestore/Cloud Run/Geoapify (`docs/STORAGE_V4_PHASE_K_PRICE_SNAPSHOT_2026-08-12.md`);
- modelo de tiers Geoapify para Address Autocomplete que conserva el esquema real por créditos/planes y no inventa un precio lineal por request;
- simulación multidevice entity-level sin pérdida silenciosa;
- simulaciones deterministas de reconnect para 1k/10k/50k/100k y contención de 100 dispositivos sobre la misma entidad;
- runbook de SLOs, costos, recovery y resiliencia;
- diagnóstico de budget account-scope/project-scope sin exponer billing account ID;
- el probe de budget aplica `x-goog-user-project: atlasmap-dev`, verifica API/permiso de quota project y usa `testIamPermissions` para separar permisos de proyecto y billing account;
- plan de budget local que exige monto explícito;
- siete logs-based metrics;
- dashboard Storage v4 dev;
- tres alert policies dev deshabilitadas;
- preflight de notification channels por Monitoring REST v3;
- comando de creación controlada de email channel en dev: dry-run por defecto, email explícito requerido, canal creado deshabilitado, sin asociación automática a policies;
- preflight SLO read-only con ratios y p50/p95/p99;
- restore preflight, restore drill aislado `atlas-restore-drill-*` y cleanup explícito endurecido;
- checkpoint Cloud consolidado read-only;
- smokes deterministas de provider outage, reconnect storm y multidevice.

Evidencia `atlasmap-dev`:

- `(default)` en `northamerica-south1`;
- PITR habilitado, retención 7 días;
- scheduled backup diario, retención 7 días;
- backup `READY` con snapshot `2026-08-12T02:05:06.847993Z`;
- **restore drill PASS** sobre `atlas-restore-drill-20260812-031227`: procedencia `sourceInfo.backup` verificada, operación administrada completada antes de leer, base restaurada legible e inventario de `345` documentos;
- se inventariaron tres restores temporales legítimos (`atlas-restore-drill-20260812-025651`, `atlas-restore-drill-20260812-030557`, `atlas-restore-drill-20260812-031227`), todos del mismo backup, en `northamerica-south1`, con restore `COMPLETED`, lineage y `etag` individual;
- **cleanup de restore PASS**: las bases temporales validadas fueron eliminadas y `(default)` permaneció intacta;
- el snapshot exacto ya no era consultable independientemente por PITR al incluir segundos/fracciones y superar una hora, por lo que no se afirmó una falsa paridad SHA-256 contra un timestamp redondeado;
- billing habilitado;
- **Cloud Billing Budget API habilitada** en `atlasmap-dev`;
- permisos de quota project y lectura verificados: `serviceusage.services.use`, `resourcemanager.projects.get`, `billing.resourcebudgets.read` y `billing.budgets.list` presentes;
- **budget visibility PASS**: account-scope `200`, project-scope `200`, `visibility=single-project-budget-readable`, `diagnosis=budget-readable`;
- **budget count confirmado: 0** tanto en account-scope como project-scope al `2026-08-12T07:28:34Z`;
- no se creó ni modificó ningún budget; el siguiente paso requiere monto y thresholds explícitamente aprobados;
- `storageV4SyncTelemetry` y `geoapifyCityAutocomplete` activas con CORS localhost validado;
- **4/4 streams** observados en Cloud Logging;
- **7/7 logs-based metrics** creadas/verificadas;
- **3/3 alert policies** creadas y verificadas deshabilitadas;
- **dashboard cleanup PASS**: Monitoring REST v1 detectó los dos dashboards Atlas equivalentes, conservó `8d6a1c24-ea96-4bc3-848d-442a40b2adef`, eliminó `2d6f5b70-dc89-43d8-87c7-f44c8a80f108` y el preflight independiente posterior confirmó `atlasDashboardCount=1`;
- el cleanup y el preflight de dashboard comparten ahora Monitoring REST v1 como fuente de verdad; el apply aborta si vuelve a detectar drift con más de un dashboard;
- **notification channel inventory PASS** al `2026-08-12T17:27:16Z`: REST v3 HTTP `200`, `notificationChannelCount=0`, `enabledUsableNotificationChannelCount=0` y las tres policies con `notificationChannelCount=0`;
- rollout sample: 38/38 success, p50 196 ms, p95 912 ms, p99 4465 ms;
- provider sample: 1/1 success, 490 ms;
- sync todavía no tiene muestra `flush` válida; el evento observado fue `queue-recovery`;
- bug de `entries=null` en singleton streams corregido en repo mediante coerción explícita a arrays.

La evidencia completa está en `docs/STORAGE_V4_PHASE_K_EVIDENCE_2026-08-11.md`.

### Bloqueos / verificaciones externas vigentes de K

- **Budget amount/thresholds:** la visibilidad ya está resuelta y hay 0 budgets. Falta una decisión explícita sobre monto y thresholds antes de crear uno; no inventar el monto ni mutar budgets sin autorización.
- **Sync flush E2E:** la instrumentación existe, pero generar señal real requiere un flujo v4 WRITE autorizado. No activar WRITE solo para telemetría.
- **Alertas:** 3 policies existen y están deshabilitadas; el inventario confirma 0 notification channels. Falta destino explícitamente aprobado, creación/verificación/asociación del canal y baseline representativo antes de activar las policies.
- **Load / reconnect:** una prueba representativa contra Cloud generaría tráfico/costo y requiere un escenario/carga aprobados.

Todavía falta para cerrar K:

- aprobar y configurar un budget de proyecto con monto/thresholds explícitos;
- generar `sync flush` E2E para medir esa señal;
- crear/verificar un notification channel aprobado, asociarlo de forma controlada y probar/activar alertas solo después de baseline representativo;
- provider outage E2E;
- multidevice E2E de navegador/dispositivos reales;
- carga/reconnect E2E y medición de SLO con tráfico representativo;
- alimentar el modelo de costos con supuestos de uso/almacenamiento medidos o aprobados; los precios públicos ya tienen snapshot fechado, pero eso por sí solo no constituye forecast ni budget.

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
