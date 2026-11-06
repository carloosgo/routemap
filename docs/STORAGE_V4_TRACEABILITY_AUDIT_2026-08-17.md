# Atlas Storage v4 — auditoría de trazabilidad A–K — 2026-08-17

Estado: **preprod reabierto hasta cerrar gaps de integración producto ↔ Storage v4**.

Base auditada: `agent/phase-3-firebase-foundation` @ `98e5ca8e5d7a1551f3d9bac20eaa43ecd7a76668`.

Esta auditoría revalida los 50+ requisitos originales como **58 checkpoints trazables**. No basta con que exista un módulo o un unit test: cada checkpoint se evalúa en seis dimensiones.

## Método de trazabilidad

1. **Requisito** — contrato/decisión original.
2. **Implementación** — código que lo materializa.
3. **Wiring** — conexión real desde el flujo normal de la aplicación.
4. **Comportamiento** — resultado alcanzable/observable por el usuario o por el runtime real.
5. **Regresión** — prueba que debe fallar si el contrato se rompe.
6. **Costo/performance** — efecto en reads/writes, red, almacenamiento, provider calls o latencia.

Estados:

- `PASS`: las seis dimensiones aplicables están cubiertas.
- `GAP`: falta una dimensión obligatoria.
- `PARTIAL`: existe el comportamiento, pero no con la semántica final definida.
- `DEFER`: decisión explícitamente diferida, no un requisito olvidado.
- `ROLLOUT`: implementado/probado pero intencionalmente fail-closed hasta Phase L.

Fuentes rectoras: `docs/STORAGE_ARCHITECTURE_V4.md`, `docs/STORAGE_V4_IMPLEMENTATION_STATUS.md`, Rules/tests v4 y código integrado. Para el requisito de autosave se conserva además la decisión original: guardado local frecuente sin costo Firestore; remoto incremental por entidad, con debounce/coalescing, nunca una escritura por tecla.

## Matriz de 58 checkpoints

| # | Requisito | Implementación | Wiring real | Comportamiento | Regresión | Costo/performance | Estado |
|---:|---|---|---|---|---|---|---|
| 1 | Aislamiento por `uid` | Paths owner-scoped + Rules | Repositorios reciben `uid` autenticado | Otro usuario no puede leer/escribir | `firestore.v4.rules.spec.js` | Sin lookup ACL extra | PASS |
| 2 | UI local-first, sin esperar red para renderizar | Reducer React | Todos los editores mutan estado React inmediato | UI responde aunque red sea lenta | tests de modelos/componentes | 0 round-trips en camino de render | PASS |
| 3 | Una tecla nunca es boundary Firestore | No hay write en handlers `onChange` | UI sólo muta React | Escribir no llama Firestore por tecla | contratos/arquitectura + tests writer | Evita explosión de writes | PASS |
| 4 | Entidad lógica = boundary remoto normal | Modelo v4 por subcolecciones | `v4TripSavePlan` genera intents por entidad | Sólo entidades cambiadas se escriben | `storageV4TripSavePlan.test.js` | Reduce writes vs revisión completa | PASS |
| 5 | Cambiar una entidad no reescribe todo el viaje | Save plan diferencial | Writer v4 usa plan incremental | Nota/segmento no obliga a reescribir places/notas ajenas | writer/save-plan tests + emulator | O(entities changed), no O(trip) writes | PASS |
| 6 | Trabajo no sincronizado sobrevive refresh/crash | Store `drafts` + mutation queue IndexedDB | **`drafts` no está conectado al editor normal** | Cambio sólo en React puede perderse antes de Save | No existe test UI→draft→reload | Local draft sería sin costo Firestore | **GAP** |
| 7 | No silent last-write-wins | `version`, conflict models | Gateway/Coordinator aplica versión base | Stale update entra a conflicto | conflict/sync/emulator suites | Puede añadir read de resolución; evita pérdida | PASS |
| 8 | Agregados no son client-authoritative | Root summary server-owned | Eventarc/backend actualiza | Cliente no puede forjar count/total | Rules + aggregate tests | Evita reescrituras de resumen cliente | PASS |
| 9 | Provider cache separado de dato canónico | `db`/`cacheDb`, persistence policy | Functions/provider clients usan frontera | Payload dinámico no se vuelve canon | provider isolation/contract tests | Reduce storage + provider calls | PASS |
| 10 | Delete de viaje irreversible para usuario | lifecycle callable + purge | UI llama delete repository; v4 writer llama Function | Viaje desaparece y no hay restore público | lifecycle/purge suites | Purge async evita operación enorme en UI | PASS |
| 11 | Background idempotente | modelos aggregate/purge/migration | Functions/Eventarc implementan idempotencia | Duplicados/out-of-order son seguros | aggregate/purge/migration tests | Evita doble count/delete | PASS |
| 12 | Migración resumable/rollback-safe | materializer/verifier/rollback | runners + Functions | `v3→v4→v3→v4` real dev PASS | migration suites + dev drill | Materialización acotada/verificable | PASS |
| 13 | No dual-write indefinido v3/v4 | Gate G + hybrid routing | fresh root-kind read antes de mutate | Un viaje tiene un canonical writer | hybrid rollout tests | Evita costo duplicado permanente | PASS |
| 14 | Semántica sync portable web/mobile | contrato platform-neutral | Web adapter IndexedDB implementado | Web cubierto; adapters mobile aún no existen | contract tests | No costo web adicional | DEFER |
| 15 | Activación sólo con gates | Remote Config/Gate G/CI | fail-closed flags | Código compilado no activa v4 por sí solo | rollout/config tests | Evita blast radius/costo accidental | PASS |
| 16 | Root v4 pequeño/materialized view | `v4TripCreateDocument`/Rules | repository root | Root contiene metadata/resumen, no full trip | repository/rules tests | Menor documento/list read | PASS |
| 17 | Segment como entidad: ciudades/fechas/gastos/nota | schema/model/doc adapter | reducer + save plan | Un tramo conserva unidad lógica | model/rules/save-plan tests | Una edición de tramo = un doc write | PASS |
| 18 | Place provider-safe | `placeForPersistence` + v4 adapter | save plan llama adapter | Google conserva referencia estable, no snapshot dinámico | provider persistence tests + Rules | Menos bytes/storage y menor staleness | PASS |
| 19 | Connection guarda intención, no output volátil | `v4EntityPayload(connection)` | save plan | geometry/ETA/steps no son canónicos | routing/provider contract tests | Evita docs grandes y writes por recalcular ruta | PASS |
| 20 | Notes son entidades independientes | schema + repository | editor notes → trip → save plan | Editar nota independiente no toca otras entidades | model/save-plan/rules tests | 1 doc por nota cambiada | PASS |
| 21 | Checklist es entidad independiente | schema + repository | editor checklist → save plan | toggle no requiere viaje completo | model/save-plan/rules tests | 1 doc por item cambiado | PASS |
| 22 | Version inicia 1 y update exacto +1 | version model + Rules | sync gateway | Stale base rechazada | version/rules/sync tests | Sin transaction read previo por happy path | PASS |
| 23 | Conflicto preserva local + remoto | sync outcome model | Coordinator guarda snapshot | No se borra edición local al detectar conflicto | sync outcome/multidevice tests | Más storage local mínimo; integridad > ahorro | PASS |
| 24 | Orden con rank lexicográfico | rank model | save plan asigna rank | Orden determinista sin float gaps | rank property/edge tests | Reorder evita cascada de writes | PASS |
| 25 | Contrato local platform-neutral | local persistence contract | composition consume adapter | Runtime no depende de IndexedDB directamente | local persistence contract tests | Permite cambiar adapter sin reescribir sync | PASS |
| 26 | IndexedDB `drafts/entities/mutations/meta` | indexedDb adapter | composition web | Stores se crean y operan | local persistence/indexedDB guard tests | Operación local; 0 Firestore | PASS |
| 27 | DraftRepository CRUD durable | `getDraft/putDraft/deleteDraft` | **API existe, editor no la usa** | No hay draft de edición normal | sólo adapter tests | Debía absorber alta frecuencia sin costo remoto | **GAP** |
| 28 | Entity + mutation se actualizan atómicamente | transaction `entities+mutations` | runtime `commitIntent` | Crash no deja dirty sin mutation | local intent/indexedDB tests | Una transacción IndexedDB local | PASS |
| 29 | Mutations same-entity coalescen | `planLocalEntityIntent` | runtime commit | Último payload reemplaza intención pendiente manteniendo base | pending/local-intent tests | Reduce writes durante typing continuo | PASS |
| 30 | Retry exponencial + jitter | retry model/Coordinator | sync runtime | Fallos transitorios no pierden queue | retry/resilience tests | Evita retry storms/provider cost | PASS |
| 31 | Una pestaña líder + lease/fencing | lease model + Coordinator | shared IndexedDB composition | Dos tabs no drenan normalmente la misma queue | cross-context/multidevice tests | Reduce writes duplicados | PASS |
| 32 | BroadcastChannel sólo notifica | notifier + durable queue | runtime cross-context | Perder mensaje no pierde datos | cross-context tests | Mensajes livianos; storage sigue autoridad | PASS |
| 33 | Scheduler con debounce | lifecycle controller (`3000ms`) | runtime lo usa cuando `commitIntent(schedule=true)` | Infra puede esperar pausa antes de flush | sync schedule/lifecycle/runtime tests | Coalescing reduce writes | PASS |
| 34 | Max dirty age + online/foreground/saveNow | schedule model + web bridge | composition arranca bridge | Infra puede flush por edad, foreground/background y saveNow | lifecycle/bridge tests | Limita latencia sin escribir por tecla | PASS |
| 35 | Editor normal → durable draft | Infra disponible | **No conectado desde `App/useTrip`** | Typing puede desaparecer en refresh/crash | No test E2E de wiring | Debe ser write local ~250–400ms, 0 Firestore | **GAP** |
| 36 | Editor normal → mutation/scheduler incremental | Runtime disponible | **Writer sólo recibe intents desde `save(rawTrip)` y usa `schedule:false`** | No existe autosync tras pausa sin Save | No test UI→scheduler | No debe implementarse llamando whole-save cada 3s | **GAP** |
| 37 | Indicador de guardado refleja estado real | Estados local/sync existen internamente | `AppMapPane` pinta `savedShort` fijo | Muestra “Guardado” incluso sólo en React | No test que ligue etiqueta a estado | Sin costo; hoy es información incorrecta | **GAP** |
| 38 | Save explícito = flush inmediato de lo pendiente | `save()` drena queue y persiste | botón/Ctrl+S llama `saveTrip` | Sí fuerza persistencia, pero sigue siendo hoy el único boundary de entrada desde UI | save/writer tests | Correcto como flush, no como único mecanismo durable | PARTIAL |
| 39 | Repository/hydration v4 | Firestore v4 repository/hydration | Hybrid repository | Viaje v4 abre en modelo React | emulator/repository tests | Reads por colecciones al abrir | PASS |
| 40 | Save plan escribe sólo diferencias | `planV4TripSave` | pilot writer | unchanged entities no generan intent | save-plan/writer tests | Principal ahorro de writes v4 | PASS |
| 41 | Google place no persiste enrichment dinámico | persistence policy | adapters/save plan | IDs/user data canónicos; detalles derivados fuera | provider tests/Rules | Reduce bytes y refresh writes | PASS |
| 42 | Route output volátil fuera de canonical connection | connection adapter | route clients/render separados | Recalcular ruta no cambia canon salvo intención | routing contract tests | Evita costos de storage por polyline/ETA | PASS |
| 43 | Rules estrictas: shape/types/timestamps/version/owner | `firestore-v4.rules` | emulator/runtime | Cliente manipulado no salta contrato | rules suites | Rechazo temprano; sin backend extra | PASS |
| 44 | Child delete = tombstone, no physical client delete | adapter/Rules | sync gateway | Offline stale device no resucita entidad | delete/rules/sync tests | 1 update + purge posterior | PASS |
| 45 | Whole-trip delete server-side | lifecycle Function | writer `remove` | baseVersion + operationId + irreversible semantics | lifecycle E2E/dev drill | Evita recursive delete desde navegador | PASS |
| 46 | Purge resumable/idempotente; parent last | purge store/job | scheduled backend | Partial purge puede reanudarse | purge emulator + real drill | Work diferido/controlado | PASS |
| 47 | Aggregate transitions idempotentes | transition model + Eventarc | backend triggers reales | Duplicate event no duplica total/count | aggregate tests + dev Eventarc | Sólo entidades relevantes disparan aggregate | PASS |
| 48 | Gate G `v3/hybrid-read/v4-pilot`, fail-closed | rollout plan/factory | repository selector | Config no resuelta bloquea mutation, no cae a writer equivocado | rollout/config tests | Evita dual writes/costo accidental | PASS |
| 49 | Hybrid fresh root-kind antes de save/delete | hybrid repository | cada mutation relee root kind | Tab vieja no reescribe v3 tras migración | hybrid tests | 1 read de seguridad por mutation legacy/hybrid | PASS |
| 50 | Migración materialize→verify→commit→rollback | migration modules/Functions | runners dev | v3 sigue autoridad hasta commit | migration tests + cloud round-trip | Costo de migración acotado y observable | PASS |
| 51 | Browser provider cache TTL + cap + merge same-key | `geoapifyClientCache` | provider clients | expiración física, 250 entries, corruption fail-soft | cache lifecycle tests | Reduce Functions/provider requests | PASS |
| 52 | Shared provider cache logical isolation + TTL | Functions `cacheDb` boundary | provider Functions | cache temporal no mezcla canonical user data | provider isolation/resilience tests | Cross-user/request hit savings | PASS |
| 53 | Secret APIs server-side + rate limiting | Callable Functions/Secret Manager/rate limits | clients llaman Functions | navegador no recibe secret privado | credential separation/security tests | Cache/rate limits contienen gasto | PASS |
| 54 | App Check observe antes de enforce | config/runbooks/functions support | dev gates; prod pendiente | Activación gradual con rollback | App Check manifest/runbook tests | Evita bloquear tráfico legítimo de golpe | ROLLOUT |
| 55 | Cost model/telemetry no inventan forecast | Phase K model + telemetry | runners/metrics dev | simulation/measured/approved diferenciados | capacity/cost/telemetry tests | Forecast sólo con inputs medidos/aprobados | PASS |
| 56 | Reconnect/load/multidevice resiliencia | Coordinator + simulations + cloud load | dev drills | load 120 children, reconnect 60/60, contention simulations PASS | Phase K resilience suites | Jitter/lease evitan storm de writes | PASS |
| 57 | PITR/backups/restore probado | Firestore recovery config/runbooks | dev real | PITR + backup + restore drill/cleanup PASS | checkpoint runners | Costo operativo explícito, no hidden runtime writes | PASS |
| 58 | Producción separada; READ antes de WRITE; fail-closed | Phase L scripts/runbook | `atlasmap-prod` L0/L1 deny-all | No tráfico v4 productivo aún | L0/L1 preflights | Cost/latency gates antes de escalar | ROLLOUT |

## Resultado previo a remediación

Clasificación de los 58 checkpoints:

- `PASS`: 50
- `GAP`: 5 entradas de tabla, pero **4 fallos funcionales únicos** porque #6/#27/#35 son distintas trazas del mismo defecto de draft no conectado
- `PARTIAL`: 1 (#38, Save todavía cumple función de entrada completa además de flush)
- `DEFER`: 1 (#14, adapters móviles; no forman parte del runtime web actual)
- `ROLLOUT`: 2 (#54 y #58, gates intencionales de Phase L)

### Cluster de defecto confirmado

No se encontró un segundo bloque arquitectónico A–K ausente. El defecto comprobado es un único cluster transversal:

```text
React editor
   │
   ├─ GAP A: no `putDraft` durable durante edición
   │
   ├─ GAP B: no genera intents normales antes de Save
   │
   ├─ GAP C: por tanto no entra al scheduler 3 s/coalescing
   │
   └─ GAP D: la UI no tiene estado real y muestra “Guardado” fijo
        ↓
IndexedDB / Sync Runtime / Firestore v4
```

El lado inferior sí está implementado: queue durable, coalescing, retries, conflicts, lease/fencing, lifecycle bridge, incremental save plan, Rules, aggregates, migration, purge, provider isolation y recovery. La remediación debe **conectar** el editor a esa infraestructura, no crear una segunda arquitectura paralela.

## Requisitos de remediación obligatorios

1. Persistir draft local frecuentemente sin Firestore write por tecla.
2. En v4, convertir cambios del editor en intents incrementales y dejar que el scheduler/coalescing controle el remote flush.
3. No implementar autosave llamando `saveTrip()` completo cada 2–3 s: ese path relee root/colecciones y fue diseñado como save/flush explícito, no como keystroke scheduler.
4. Recuperar el draft tras refresh/crash cuando todavía existen mutations/estado local pendiente.
5. Mantener `version`/conflict semantics; ningún draft puede sobrescribir silenciosamente un servidor avanzado.
6. Hacer que Save/Ctrl+S sea un **flush now** de la edición más reciente, conservando compatibilidad v3/hybrid durante rollout.
7. Reemplazar el “Guardado” fijo de la nota de tramo por un estado derivado real: pendiente/local, sincronizando, sincronizado o error/conflicto.
8. Añadir contract/integration tests que fallen si se desconecta otra vez `editor → draft → queue → scheduler`.
9. Re-ejecutar Quality, Rules, Phase-K scoped Rules, lint y build; mantener Dependency Audit/CodeQL sin regresiones antes de volver a cerrar preprod.

## Criterio de cierre de esta auditoría

Preprod sólo vuelve a `CLOSED` si:

- #6, #27, #35, #36 y #37 pasan a `PASS`;
- #38 queda semánticamente como flush-now sin romper v3/hybrid;
- no aparece un nuevo gap independiente durante tests/CI;
- el nuevo wiring prueba que múltiples cambios rápidos de una misma entidad se coalescen y **no producen una escritura Firestore por tecla**;
- refresh/crash recovery conserva trabajo local no confirmado;
- el indicador visual nunca afirma “Guardado” cuando el estado sólo existe en React.
