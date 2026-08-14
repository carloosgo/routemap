# Storage v4 — operations runbook

Este documento cubre Phase K del roadmap original: observabilidad, costos, backups, restore drill y pruebas de carga. No activa producción ni modifica el rollout Gate G.

## 1. Señales mínimas

### Cliente / Sync Coordinator

Medir de forma agregada y sin contenido de viaje:

- operaciones pendientes;
- edad de la mutación pendiente más antigua;
- duración de sync;
- outcome `success | conflict | retryable-error | permanent-error`;
- retries por operación;
- cambios de estado `local-only | pending | syncing | synced | error`;
- conflictos de versión;
- recuperaciones después de offline/reconnect.

Nunca registrar UID, tripId, entityId, nombres, notas, búsquedas, coordenadas privadas ni payloads de mutación en la telemetría operacional.

El runtime expone eventos agregados de `flush` y `queue-recovery`. La callable `storageV4SyncTelemetry` aplica un contrato allowlist antes de emitir `storage_v4_sync_metric`; rechaza campos desconocidos y no admite UID, tripId, entityId, entityKey ni payload. Su cliente es best-effort, con buffer acotado. La señal ya fue desplegada y observada E2E en `atlasmap-dev` sin activar Storage v4 WRITE globalmente.

### Firestore / backend

Observar como mínimo:

- document reads/writes/deletes;
- request/error rate;
- latencia de Functions;
- invocaciones y errores por Function;
- `permission-denied` / `unauthenticated`;
- backlog de purge;
- fallos de agregados;
- volumen de documentos de cache y expiraciones.

### Proveedores

Por proveedor y operación, sin consulta cruda:

- request count;
- 2xx / 4xx / 429 / 5xx;
- latencia;
- cache hit ratio;
- timeout/network failure;
- fallback utilizado.

El backend emite `storage_v4_provider_cache_metric` como señal agregada del cache compartido. Sus outcomes actuales son `hit`, `miss`, `read-error` y `write-error`. El evento solo puede incluir nombre de colección y, cuando existe un error, `errorName`/`errorCode` saneados; nunca debe incluir key, query, documentId, UID, resultado del proveedor ni contenido del viaje. El sink es best-effort y una falla de observabilidad no puede convertir un hit/miss en fallo funcional.

Las llamadas salientes realizadas mediante `limitedFetch` emiten `storage_v4_provider_request_metric` con etiquetas estáticas `provider`/`operation`, outcome (`success`, `http-error`, `network-error`, `parse-error`), HTTP status y duración. La clasificación consume internamente la URL para producir etiquetas permitidas, pero la URL, query string, API key, body y respuesta nunca forman parte del evento.

Los cuatro streams estructurados —rollout, sync, provider cache y provider request— ya tienen evidencia E2E real en Cloud Logging de `atlasmap-dev`.

## 2. SLO inicial de Atlas Storage

Estos son objetivos internos iniciales y deben revisarse con tráfico real antes de convertirlos en compromisos externos.

| Señal | Objetivo inicial |
|---|---:|
| Lectura de viaje disponible, excluyendo outage total de proveedor ajeno al storage | >= 99.9% |
| Guardado local visible para el usuario | >= 99.99% |
| Mutación cloud confirmada cuando hay conectividad normal | >= 99.5% en 30 s |
| Operaciones de repositorio sin error inesperado | >= 99.5% |
| Conflictos que terminan en pérdida silenciosa de datos | 0 |
| Escrituras cliente directas a datos v4 protegidos | 0 |
| PII/contenido de viaje en telemetría operacional | 0 |

Una degradación de proveedor no debe impedir editar el viaje. El editor debe conservar el estado local y sincronizar cuando el backend vuelva a estar disponible.

El preflight `phase-k:slo:preflight` calcula sobre Cloud Logging, en modo exclusivamente read-only:

- success rate de repositorio y provider;
- success rate accionable de `sync flush`, excluyendo `not-leader` del denominador de fallos;
- cache hit rate sobre `hit + miss`;
- p50/p95/p99 de rollout, sync flush y provider request;
- bandera `truncated` si un stream alcanza el límite de muestra y por tanto no puede tratarse como ventana SLO completa.

La muestra real del 2026-08-14 confirmó 5 `flush` reales y 5/5 `success`, con p50 154 ms y p95/p99 878 ms. Las muestras agregadas de rollout/provider de esa jornada incluyen fallos deliberados de pilot, kill-switch y provider-outage; no deben reutilizarse como baseline productivo.

## 3. Alertas

Configurar alertas accionables; evitar alertas por cada evento individual.

Prioridad alta:

- error rate de Functions storage > 2% durante 5 min;
- incremento sostenido de `permission-denied` después de un cambio de Rules/rollout;
- pérdida de paridad v3/v4 o schema desconocido;
- mutaciones pendientes con edad > 5 min bajo conectividad normal;
- purge backlog creciendo durante dos ventanas consecutivas;
- error de agregados o doble aplicación detectada;
- presupuesto real o previsto superando umbrales definidos.

Prioridad media:

- p95 de lectura/sync duplica el baseline durante 15 min;
- cache hit ratio cae materialmente respecto al baseline;
- proveedor devuelve 429/5xx por encima del baseline;
- incremento anormal de reintentos/reconexiones.

Estado real en `atlasmap-dev` al 2026-08-14:

- existen exactamente 3 alert policies Atlas Storage v4;
- las 3 están deshabilitadas;
- las 3 apuntan al mismo notification channel email Atlas;
- el canal está habilitado y usable;
- el repo incluye `phase-k:observability:toggle-alerts-dev`, que inventaría exactamente esas 3 policies y ese canal antes de cambiar únicamente el campo `enabled`;
- habilitar/deshabilitar exige token de confirmación explícito y nunca cambia thresholds, canal, budget, datos de aplicación ni producción.

Los thresholds actuales son plantillas dev, no baseline productivo: repository dispara ante cualquier error de rollout en 5 min; sync ante cualquier `unexpected-error` de flush en 5 min; provider ante más de cinco requests no-success en 5 min. No habilitar a ciegas ni convertirlos en SLO externo sin una prueba controlada y un baseline representativo.

## 4. Dashboard mínimo

Un dashboard de Storage v4 debe mostrar en una sola vista:

1. operaciones de repositorio por modo (`v3`, `hybrid-read`, futuro `v4`);
2. success/error rate;
3. p50/p95/p99 de latencia;
4. mix de schemas leído;
5. reads/writes/deletes de Firestore;
6. invocaciones/errores/latencia de Functions;
7. pending/retry/conflict del sync;
8. purge backlog;
9. cache hit ratio y errores por proveedor;
10. gasto actual y forecast contra presupuesto.

Fuentes estructuradas validadas E2E en `atlasmap-dev`:

```text
storage_v4_rollout_metric
storage_v4_sync_metric
storage_v4_provider_cache_metric
storage_v4_provider_request_metric
```

El bundle declarativo `ops/storage-v4/observability/` prepara counters y distribuciones de latencia, ratios de éxito/cache hit, señales Firestore/Cloud Run y panel de logs.

Estado real al 2026-08-14: existe exactamente 1 dashboard Atlas Storage v4 dev y 7/7 logs-based metrics esperadas. El dashboard ya no es solo una definición en repo; fue creado y verificado server-side en `atlasmap-dev`.

El comando de checkpoint preferido es:

```bash
npm run phase-k:observability:checkpoint-dev -- --apply
```

Ese comando está limitado a los recursos de observabilidad dev, ejecuta post-verificación server-side y después encadena el checkpoint Cloud read-only. No modifica budgets, no ejecuta restore, no habilita Storage v4 WRITE y no toca producción.

## 5. Modelo de capacidad/costos

Mantener escenarios separados para:

```text
1,000 usuarios activos
10,000 usuarios activos
50,000 usuarios activos
100,000 usuarios activos
```

Para cada escenario registrar supuestos explícitos:

- viajes abiertos por usuario/día;
- entidades editadas por viaje;
- mutaciones lógicas por sesión;
- reads de list/get;
- writes de entidad;
- writes/reads de agregados;
- cache hit ratio;
- llamadas a proveedor por miss;
- bytes promedio por documento;
- retención de backups/PITR;
- invocaciones de Functions.

No fijar precios unitarios dentro del código de la aplicación. Aplicar los precios vigentes de Firebase/Google Cloud/proveedores en la hoja o cálculo operacional de cada revisión de costos.

Regla de arquitectura: una modificación lógica debe aproximarse a una escritura lógica de entidad; una edición de nota no debe reescribir el viaje completo.

El repo ya incluye `phase-k:cost:scenarios`; el cierre económico requiere alimentar el modelo con supuestos de uso medidos o explícitamente aprobados. No inferir volumen de usuarios ni presupuesto por conveniencia técnica.

## 6. Backups y PITR

Antes de producción:

- habilitar PITR en la base canónica;
- definir backup diario o semanal según RPO/RTO aprobado;
- definir retención;
- documentar owner de recuperación;
- verificar que la política también cubre cualquier base nombrada que pase a ser operacionalmente necesaria.

En `atlasmap-dev`, PITR está habilitado con retención de 7 días y existe un scheduled backup diario con retención de 7 días. El último checkpoint del 2026-08-14 observó múltiples backups `READY`.

Firestore PITR conserva una ventana de hasta siete días cuando está habilitado. Los scheduled backups se restauran a una base nueva. Las políticas TTL no viajan dentro del backup, por lo que deben reaplicarse/verificarse tras un restore.

## 7. Restore drill obligatorio

No considerar backups "validados" solo porque exista un schedule.

Procedimiento:

1. escoger un backup/snapshot controlado;
2. restaurar a una base nueva y aislada;
3. no apuntar el cliente productivo a esa base;
4. validar conteos de roots y entidades;
5. verificar ownership y versiones;
6. verificar agregados contra entidades;
7. verificar deleted/tombstones;
8. comprobar que no aparezcan mutaciones internas como datos de usuario;
9. reaplicar/verificar TTL e índices necesarios;
10. hidratar una muestra de viajes y comparar con el origen esperado;
11. registrar RTO real y cualquier diferencia;
12. eliminar la base de drill cuando el procedimiento de retención lo permita.

Resultado aceptable: restore reproducible, datos hidratables y sin pérdida/inconsistencia no explicada.

Reglas de seguridad del drill:

- nunca restaurar encima de `(default)`;
- destino nuevo, aislado y explícitamente identificado como drill;
- ninguna limpieza destructiva debe formar parte del mismo comando de restore;
- la creación del destino es cost-bearing y requiere un checkpoint `-Apply` explícito;
- no forzar APIs preview de acceso server-side a named databases solo para cerrar la evidencia.

El restore drill real de `atlasmap-dev` ya pasó y su cleanup también. El checkpoint posterior confirmó 0 bases temporales `atlas-restore-drill-*` remanentes. Esto cierra la evidencia de recuperación en dev; no equivale a autorizar restore de producción.

## 8. Pruebas de carga y resiliencia

### Reconnect storm

La suite local mantiene pruebas deterministas de reconnect/capacity. Además, el drill cloud acotado ejecutó 60 updates escalonados sobre un fixture sintético y terminó 60/60 success, sin failures, con convergencia posterior de aggregates.

### Provider outage

El E2E dev de provider outage ya pasó. El smoke determinista también cubre 429, 503, network error, JSON inválido, privacidad de telemetría y fallo del metric sink. Esto valida backend/resiliencia; la UX real frente a cada proveedor debe seguir observándose durante rollout.

### Multidevice

La lógica de conflicto/contención tiene simulaciones deterministas. Para un gate productivo estricto puede conservarse una muestra adicional de dos navegadores/dispositivos reales sobre el mismo usuario, cubriendo:

- edición de entidades distintas;
- misma entidad con version mismatch;
- delete en un dispositivo mientras otro conserva draft;
- reconnect después de conflicto.

No se exige merge complejo campo-a-campo en v4.0; el comportamiento debe ser determinista y nunca silenciosamente destructivo.

### Carga de viajes

El drill cloud real del 2026-08-14 creó un fixture de 120 hijos (20 segments, 40 places, 20 connections, 20 notes y 20 checklist), ejecutó 10 hydrates y después 60 updates de reconnect.

Resultado funcional:

- 120/120 hijos creados;
- 60/60 updates de reconnect exitosos;
- 0 failures;
- aggregates convergentes antes y después del reconnect;
- cleanup del fixture PASS.

Mediciones observadas:

- creación de hijos: 751 ms;
- aggregate convergence inicial: 31,666 ms;
- hydrate p50: 2,746 ms;
- hydrate p95/p99: 17,872 ms;
- reconnect write p50: 4,187 ms;
- reconnect write p95: 5,644 ms;
- reconnect write p99: 5,817 ms;
- aggregate convergence post-reconnect: 17,869 ms.

Estas cifras prueban robustez funcional del camino Cloud Firestore + Eventarc bajo esa carga acotada; no son todavía un SLO productivo ni una prueba de dos dispositivos/browser reales. Las colas de Eventarc y latencias de hydrate deben revisarse antes de aceptar el gate productivo.

## 9. Presupuestos

Configurar un budget por proyecto (dev y producción separados) y alertas de gasto real/forecast. Un budget de Cloud Billing es una señal de alerta, no debe asumirse como hard cap automático.

Estado real de `atlasmap-dev` al 2026-08-14:

- billing habilitado;
- Budget API habilitada y legible;
- permisos de lectura verificados;
- lectura account-scope y project-scope disponible;
- budget count = 0.

Por tanto, ya no existe incertidumbre de lectura: actualmente no hay budget configurado para el scope comprobado. El monto y thresholds siguen siendo una decisión financiera explícita y no se inventan.

Herramientas preparadas:

- `phase-k:budget:diagnose`: lectura/diagnóstico sin exponer billing account ID;
- `phase-k:budget:plan -- --amount=<monto>`: construye localmente el plan y exige monto explícito;
- `phase-k:budget:apply-dev`: apply guardado y limitado a `atlasmap-dev`; no tiene monto default y exige confirmación explícita.

No ejecutar `apply-dev` hasta que exista aprobación del monto mensual y sus thresholds.

## 10. CI y criterio de cierre de Phase K

Checkpoint CI dev cerrado en el commit `84167d931a836a050bfd74727d568c786675f7cc`:

- unit tests PASS;
- Firestore Rules suite PASS;
- Phase K scoped Rules PASS;
- ESLint PASS;
- production build PASS;
- Dependency audit PASS;
- CodeQL PASS.

Phase K queda cerrada solo con evidencia de:

- dashboard creado — **PASS dev**;
- métricas cliente/backend/proveedor visibles — **PASS dev**;
- PITR/backups configurados — **PASS dev**;
- restore drill ejecutado — **PASS dev**;
- load/reconnect/provider-outage ejecutados — **PASS dev**;
- migración/purge/sync flush E2E — **PASS dev**;
- CI completo verde — **PASS**;
- alertas representativas probadas — **pendiente**;
- presupuesto configurado — **pendiente de decisión financiera**;
- costo modelado con supuestos aprobados — **pendiente**;
- aceptación/tuning de latencias cloud observadas — **pendiente para gate productivo**;
- muestra browser/device real — **pendiente solo si se conserva como requisito productivo**.

No iniciar Phase L por inercia. Producción permanece intacta hasta aprobación explícita del rollout productivo.
