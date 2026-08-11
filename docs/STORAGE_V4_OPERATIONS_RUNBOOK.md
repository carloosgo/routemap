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

Nunca registrar UID, tripId, entityId, nombres, notas, búsquedas, coordenadas privadas ni payloads de mutación en la telemetría de rollout.

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

## 6. Backups y PITR

Antes de producción:

- habilitar PITR en la base canónica;
- definir backup diario o semanal según RPO/RTO aprobado;
- definir retención;
- documentar owner de recuperación;
- verificar que la política también cubre cualquier base nombrada que pase a ser operacionalmente necesaria.

Firestore PITR conserva una ventana de hasta siete días cuando está habilitado. Los scheduled backups pueden ser diarios o semanales y se restauran a una base nueva. Las políticas TTL no viajan dentro del backup, por lo que deben reaplicarse/verificarse tras un restore.

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

## 8. Pruebas de carga y resiliencia

### Reconnect storm

Mantener el test determinista de 1,000 clientes con jitter. En staging añadir una prueba E2E que simule reconexiones escalonadas y confirme ausencia de thundering herd.

### Provider outage

Simular timeout/429/5xx y confirmar:

- editor continúa usable;
- dato local no se pierde;
- cache vigente se usa cuando el contrato del dato lo permita;
- el error no provoca loops agresivos;
- backoff y métricas son correctos.

### Multidevice

Como mínimo:

- dos pestañas mismo usuario;
- dos dispositivos mismo usuario;
- edición de entidades distintas;
- edición de misma entidad con version mismatch;
- delete en un dispositivo mientras otro tiene draft;
- reconnect después de conflicto.

No se exige merge complejo campo-a-campo en v4.0; el comportamiento debe ser determinista y nunca silenciosamente destructivo.

### Carga de viajes

Probar tamaños pequeño/medio/grande y medir:

- tiempo de `list`;
- tiempo de `get/hydrate`;
- número de reads;
- tamaño transferido;
- mutaciones por edición;
- comportamiento offline y al reconectar.

## 9. Presupuestos

Configurar un budget por proyecto (dev y producción separados) y alertas de gasto real/forecast. Un budget de Cloud Billing es una señal de alerta, no debe asumirse como un hard cap automático.

Los umbrales concretos deben fijarse con el presupuesto operativo aprobado del proyecto. Como mínimo, usar múltiples escalones para advertencia temprana y crítica, y definir el responsable que actúa ante cada uno.

## 10. Criterio de cierre de Phase K

Phase K queda cerrada solo con evidencia de:

- dashboard creado;
- alertas probadas;
- presupuesto configurado;
- métricas cliente/backend/proveedor visibles;
- PITR/backups configurados;
- restore drill ejecutado;
- load/reconnect/provider-outage/multidevice ejecutados;
- SLOs medidos contra resultados reales;
- CI completo verde.

Los documentos y tests del repositorio preparan esos controles, pero los checkpoints de Cloud Console/Firestore requieren evidencia del entorno objetivo.