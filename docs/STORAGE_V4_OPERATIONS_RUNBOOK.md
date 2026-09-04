# Storage v4 — operations runbook

Fecha de revisión: **2026-09-03**

Este es el runbook operacional vigente de Storage v4. Atlas ya no opera un rollout entre generaciones de storage: **v4 es la única arquitectura autenticada soportada**.

## 1. Separación de entornos

```text
local/emulators -> desarrollo y pruebas deterministas
atlasmap-dev    -> integración/preproducción cloud
atlasmap-prod   -> producción protegida
```

- `atlasmap-dev` es el único proyecto permitido para pruebas cloud de desarrollo.
- `atlasmap-prod` nunca se usa como backend de desarrollo.
- `git push` no equivale a deploy.
- toda mutación cloud requiere el flujo explícito y guardado de esa superficie.

## 2. Verificación de preprod

Stage v4 canónico:

```powershell
npm run storage-v4:dev:verify
```

Debe comprobar de forma read-only:

- proyecto exactamente `atlasmap-dev`;
- tres Functions v4 esperadas;
- seis triggers Eventarc esperados;
- Rules activas idénticas a `firestore.rules`;
- `touchesProduction: false`.

Paridad operacional:

```powershell
npm run storage-v4:dev:preprod-parity
npm run storage-v4:dev:platform-parity
```

El primer comando combina runtime v4 y controles Phase K vigentes. El segundo inventaría recuperación, Web App/Auth, Hosting, App Check/reCAPTCHA, Secret Manager, Identity Toolkit y TTL. Ambos son read-only.

No existe verificación de Gate G, cohortes, pilot o selección v3/v4.

## 3. Señales mínimas

### Cliente / Sync Coordinator

Medir de forma agregada y sin contenido del viaje:

- operaciones pendientes;
- edad de la mutación más antigua;
- duración de sync;
- outcome `success | conflict | retryable-error | permanent-error`;
- retries;
- cambios `local-only | pending | syncing | synced | error`;
- conflictos de versión;
- recuperación después de offline/reconnect.

Nunca registrar UID, tripId, entityId, nombres, notas, búsquedas, coordenadas privadas ni payloads de mutación en telemetría operacional.

### Firestore / backend

Observar como mínimo:

- reads/writes/deletes;
- request/error rate;
- latencia de Functions;
- invocaciones/errores por Function;
- `permission-denied` / `unauthenticated`;
- backlog de purge;
- fallos de agregados;
- volumen/expiración de caches internos.

### Proveedores

Por proveedor y operación, sin query cruda ni secreto:

- request count;
- 2xx / 4xx / 429 / 5xx;
- latencia;
- cache hit ratio;
- timeout/network failure;
- fallback permitido por el contrato del proveedor.

La telemetría y el cache son best-effort: una falla suya no puede convertir un guardado válido del usuario en un fallo funcional.

## 4. SLO internos iniciales

Estos objetivos son internos y deben recalibrarse con tráfico productivo real:

| Señal | Objetivo inicial |
|---|---:|
| Lectura de viaje disponible | >= 99.9% |
| Guardado local visible | >= 99.99% |
| Mutación cloud confirmada con conectividad normal | >= 99.5% en 30 s |
| Operaciones de repositorio sin error inesperado | >= 99.5% |
| Pérdida silenciosa por conflicto | 0 |
| Escrituras fuera del contrato de Rules | 0 |
| PII/contenido de viaje en telemetría | 0 |

Las cifras obtenidas en drills dev son evidencia de robustez, no un SLO productivo definitivo.

## 5. Alertas y dashboard

Prioridad alta:

- incremento material de errores de Functions;
- `permission-denied` anormal tras cambios de Rules;
- mutaciones pendientes demasiado antiguas con conectividad normal;
- purge backlog creciente;
- inconsistencias de agregados;
- señales de pérdida silenciosa/conflictos no resueltos;
- presupuesto real o previsto fuera de umbrales.

Prioridad media:

- degradación sostenida de p95;
- caída material de cache hit ratio;
- 429/5xx de proveedores por encima del baseline;
- incremento anormal de retries/reconnects.

El dashboard actual debe describir **v4**, no un mix de schemas. Debe priorizar:

1. éxito/error/latencia del repositorio v4;
2. sync pending/retry/conflict;
3. Firestore reads/writes/deletes;
4. Functions y Eventarc;
5. agregados/lifecycle/purge;
6. provider/cache;
7. App Check/Auth cuando estén activos;
8. gasto contra budget.

Los identificadores históricos de métricas `rollout_*` pueden conservarse mientras sean contratos de observabilidad desplegados. Su nombre no implica que exista un rollout de storage en runtime. Renombrarlos requiere una migración de observabilidad separada para no romper series/dashboard/alertas.

## 6. Recovery

Antes de tráfico productivo:

- PITR habilitado;
- backup schedule y retención definidos;
- al menos un backup utilizable observado;
- owner/RPO/RTO documentados;
- restore drill ejecutado a una base nueva y aislada cuando corresponda.

Reglas del restore drill:

1. nunca restaurar encima de `(default)`;
2. destino nuevo y explícitamente identificado como drill;
3. validar roots, entidades, ownership, versiones, agregados y tombstones;
4. verificar/reaplicar índices y TTL requeridos;
5. hidratar muestras y comparar con el origen esperado;
6. registrar RTO y diferencias;
7. limpiar la base temporal mediante un paso separado y explícito.

La evidencia histórica de Phase K confirma que un restore drill dev fue ejecutado y limpiado correctamente. Eso no autoriza ni sustituye un drill productivo actual.

## 7. Capacidad y costos

Mantener escenarios separados, como mínimo, para:

```text
1,000 usuarios activos
10,000 usuarios activos
50,000 usuarios activos
100,000 usuarios activos
```

Registrar supuestos explícitos de viajes, entidades editadas, reads, writes, agregados, cache hit ratio, llamadas a proveedor, tamaños de documentos, backups y Functions.

No codificar precios unitarios cloud dentro de la aplicación. El forecast productivo debe usar precios vigentes y supuestos medidos o explícitamente aprobados.

Regla estructural: una modificación lógica debe aproximarse a una escritura de la entidad afectada; editar una nota no debe reescribir el viaje completo.

## 8. Resiliencia

Antes de producción deben seguir cubiertos:

- reconnect storm;
- provider outage;
- conflictos multidevice;
- delete mientras otro dispositivo conserva draft;
- version mismatch;
- carga de viajes con muchas entidades;
- retries idempotentes de Eventarc/Functions;
- fallo de telemetría/cache sin pérdida de trabajo del usuario.

No se exige merge complejo campo-a-campo en v4.0, pero cualquier conflicto debe ser determinista y nunca silenciosamente destructivo.

## 9. Secretos y proveedores

- secretos privados solo en Secret Manager/backend;
- keys dev y prod administradas independientemente;
- claves web públicas restringidas por dominio/API;
- payloads arbitrarios del proveedor no se convierten en dato canónico del usuario;
- routing, ETA, tráfico y resultados recalculables pertenecen a cache/capas derivadas según contrato.

## 10. Producción

La salida productiva se rige por `STORAGE_V4_PRODUCTION_ROLLOUT.md`, que ahora define un **release directo v4**.

Rollback permitido: artefactos, Functions, Rules o configuración anteriores que sigan siendo compatibles con v4.

Rollback prohibido: reactivar v3, hybrid read, dual-write, Gate G o selección de generación mediante Remote Config.

Si aparece estado legacy inesperado, detener, inventariar y resolver deliberadamente antes de continuar.

## 11. CI y cierre

Un HEAD de código solo se considera certificado cuando Quality, CodeQL y Dependency Audit terminan verdes sobre el mismo SHA. Quality incluye tests, contratos, Rules emulator tests, ESLint y build según el workflow vigente.

Después de cualquier deploy cloud autorizado se requiere una verificación server-side del recurso remoto; CI verde no prueba por sí solo qué versión está desplegada.

## 12. Documentación histórica

Los closeouts fechados de Gate G, pilot, migración, cohortes y antiguas fases L4–L7 permanecen como evidencia histórica. No deben utilizarse como runbooks vigentes ni como justificación para volver a introducir una segunda arquitectura de persistencia.
