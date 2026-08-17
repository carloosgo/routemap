# Provider cache topology

## Objetivo v4

La topología objetivo de Atlas Storage v4 mantiene responsabilidades separadas:

```text
(default)    datos canónicos de usuario + estado interno no-cache
atlas-cache  cache temporal/derivado de proveedores (separación física futura)
```

La separación **lógica** es obligatoria en v4.0. La separación **física** en una database nombrada permanece deliberadamente diferida conforme a `STORAGE_V4_PHASE_J_DECISION_2026-08-14.md`; no es un requisito pendiente para declarar Phase J cerrada en v4.0.

Cuando `atlas-cache` se active en el futuro, el frontend no deberá leerla ni escribirla. El acceso será exclusivamente server-side y cada documento temporal conservará un `expiresAt` explícito; la lógica de lectura decide frescura por ese campo y no depende de que el proceso TTL haya eliminado físicamente el documento.

## Frontera de código

`functions/geoapifyRuntime.js` expone dos dependencias distintas:

- `db`: Firestore canónico/interno; se usa, entre otras cosas, para cuotas compartidas.
- `cacheDb`: punto único de inyección para datos temporales de proveedores.

Los callsites de cache dependen de `cacheDb`, aunque en v4.0 ambos alias apunten físicamente a `(default)`.

Esto evita que una migración física futura requiera reescribir cada Function y reduce el riesgo de mover accidentalmente `functionRateLimits` u otro estado interno junto con el cache.

## Collection groups temporales actuales

El manifiesto operativo canónico vive en `scripts/storageV4DevTtlManifest.mjs`.

Los caches/estados temporales de proveedor que deben depender de `cacheDb` son:

- `citySearchCache`;
- `placeSearchCache`;
- `geocodeCache`;
- `placeDetailsCache`;
- `placeEnrichmentCache`;
- `routeCache`;
- `routeEstimateCache`;
- `countryBoundaryCache`;
- `googlePlaceLocationCache`;
- `googleCountryPlaceIdCacheV4`;
- `geoapifyBatchJobs` mientras se conserve como estado temporal del proveedor.

Además, `functionRateLimits` usa `expiresAt` y requiere TTL para limpieza operativa, pero **permanece deliberadamente en `db`** porque es estado interno de control de cuota, no cache de proveedor.

Los doce collection groups del manifiesto TTL usan `expiresAt` como timestamp administrable. El manifiesto es la fuente única para el inventario de paridad y el runner de lifecycle dev; no mantener listas TTL paralelas a mano.

## Estado v4.0

La frontera lógica está implementada y es el estado aprobado para v4.0:

```js
export const db = getFirestore();
export const cacheDb = db;
```

Esta decisión no mezcla semánticamente cache con datos canónicos: los callsites continúan separados, los temporales usan `expiresAt`, las lecturas validan frescura y los contratos impiden que payloads temporales de proveedor se conviertan en entidades canónicas del viaje.

No cambiar `cacheDb` a una base nombrada dentro de una entrega productiva únicamente para satisfacer un checklist histórico. La separación física se reabre cuando la vía server-side elegida esté aprobada para producción y el cambio pueda validarse como checkpoint independiente.

## Browser cache

La caché persistente del navegador es una capa distinta y complementaria a `cacheDb`:

- evita invocar una Function cuando el mismo usuario ya tiene un resultado fresco;
- es best-effort y descartable;
- debe estar acotada y limpiar entradas vencidas;
- nunca es fuente canónica de datos del usuario;
- una pérdida/corrupción de esa caché sólo provoca un miss y no debe romper la aplicación.

El backend shared cache sigue siendo necesario porque protege consumo de proveedor entre usuarios/instancias incluso cuando un navegador particular hace miss.

## Lifecycle en `atlasmap-dev`

`npm run storage-v4:dev:data-lifecycle` ejecuta un dry-run contra `atlasmap-dev` y compara Firestore con el manifiesto canónico. El modo `--apply` está protegido por confirmación explícita y puede:

1. habilitar Delete Protection en `(default)` si falta;
2. iniciar TTL sobre `expiresAt` únicamente para collection groups del manifiesto que aún no estén configurados;
3. abortar si encuentra un TTL conflictivo en otro campo o una policy en estado no saludable;
4. dejar Rules, Functions, Remote Config, Auth y `atlasmap-prod` sin cambios.

TTL puede permanecer temporalmente en `CREATING`; el inventario distingue configuración iniciada de estado `ACTIVE` y no declara paridad completa hasta observar todos los TTL activos.

## Decisión canónica de Phase J

Phase J está **CLOSED FOR V4.0** cuando se cumplen las garantías aprobadas en `docs/STORAGE_V4_PHASE_J_DECISION_2026-08-14.md`:

- los callsites temporales pasan por `cacheDb`;
- existe separación lógica entre datos canónicos, estado interno y provider cache;
- los documentos temporales tienen freshness/TTL explícito;
- la caché es fail-soft y los smoke/resilience tests no bloquean el editor ante fallo de cache/proveedor;
- la separación física no se fuerza mediante una API server-side que no cumpla el nivel de madurez aprobado para producción.

`docs/STORAGE_V4_IMPLEMENTATION_STATUS.md` refleja este mismo criterio. Si un documento anterior contradice esta decisión, prevalecen el decision record y los closeouts posteriores.

## Checkpoint futuro para separación física

La creación de `atlas-cache` es una evolución posterior, no la reapertura automática de Phase J. Antes de cambiar `cacheDb` a esa database:

1. volver a verificar la documentación oficial del SDK/runtime en ese momento;
2. confirmar que el acceso server-side a named databases elegido es production-ready para Atlas;
3. crear `atlas-cache` en ubicación compatible;
4. configurar Rules cliente deny-all para esa base;
5. configurar TTL sobre `expiresAt` para las collection groups aplicables;
6. verificar IAM de las Functions;
7. ejecutar smoke tests de hit/miss/expiración y provider outage;
8. confirmar que `db` continúa apuntando a `(default)` y que cuotas/datos canónicos no se movieron;
9. medir latencia y costo antes de ampliar tráfico.

## Checkpoint histórico del SDK

El 2026-08-11 la referencia revisada para Firebase Admin Node marcaba la vía de acceso a named databases evaluada por Atlas como no adecuada para activación productiva. Ese dato es histórico: antes de una futura separación física debe verificarse de nuevo contra la documentación oficial vigente, sin asumir que el estado del SDK sigue siendo el mismo.
