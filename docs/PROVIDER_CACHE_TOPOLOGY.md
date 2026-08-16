# Provider cache topology

## Objetivo v4

La topología objetivo de Atlas Storage v4 mantiene responsabilidades separadas:

```text
(default)    datos canónicos de usuario + estado interno no-cache
atlas-cache  cache temporal/derivado de proveedores
```

El frontend no debe leer ni escribir `atlas-cache`. El acceso es exclusivamente server-side y cada documento temporal conserva un `expiresAt` explícito; la lógica de lectura decide frescura por ese campo y no depende de que el proceso TTL haya eliminado físicamente el documento.

## Frontera de código

`functions/geoapifyRuntime.js` expone dos dependencias distintas:

- `db`: Firestore canónico/interno; se usa, entre otras cosas, para cuotas compartidas.
- `cacheDb`: punto único de inyección para datos temporales de proveedores.

Los callsites de cache deben depender de `cacheDb`, aunque durante la transición ambos alias apunten físicamente a `(default)`.

Esto evita que la migración física futura requiera reescribir cada Function y reduce el riesgo de mover accidentalmente `functionRateLimits` u otro estado interno junto con el cache.

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

## Estado actual

La frontera lógica está implementada, pero la separación física permanece deliberadamente desactivada:

```js
export const db = getFirestore();
export const cacheDb = db;
```

No cambiar ese alias a una base nombrada dentro de una entrega productiva sin resolver antes el checkpoint de SDK y provisioning descrito abajo.

## Lifecycle en `atlasmap-dev`

`npm run storage-v4:dev:data-lifecycle` ejecuta un dry-run contra `atlasmap-dev` y compara Firestore con el manifiesto canónico. El modo `--apply` está protegido por confirmación explícita y puede:

1. habilitar Delete Protection en `(default)` si falta;
2. iniciar TTL sobre `expiresAt` únicamente para collection groups del manifiesto que aún no estén configurados;
3. abortar si encuentra un TTL conflictivo en otro campo o una policy en estado no saludable;
4. dejar Rules, Functions, Remote Config, Auth y `atlasmap-prod` sin cambios.

TTL puede permanecer temporalmente en `CREATING`; el inventario distingue configuración iniciada de estado `ACTIVE` y no declara paridad completa hasta observar todos los TTL activos.

## Checkpoint para separación física

Antes de cambiar `cacheDb` a `atlas-cache`:

1. crear `atlas-cache` en el proyecto objetivo, en ubicación compatible con la arquitectura;
2. configurar Rules del cliente en deny-all para esa base;
3. configurar TTL sobre `expiresAt` para las collection groups aplicables;
4. verificar IAM de las Functions;
5. confirmar un acceso server-side soportado para bases nombradas en el runtime usado por producción;
6. ejecutar smoke tests de hit/miss/expiración y provider outage;
7. confirmar que `db` continúa apuntando a `(default)` y que cuotas/datos canónicos no se movieron;
8. medir latencia y costos antes de ampliar tráfico.

## Bloqueo de SDK observado el 2026-08-11

La referencia oficial de Firebase Admin Node marcaba `getFirestore(databaseId)` / `initializeFirestore(..., databaseId)` como **Public Preview** en el checkpoint del 2026-08-11 e indicaba que no debía usarse en producción. Por eso Atlas no activó esa API de forma productiva solo para completar formalmente Phase J.

Ese estado debe volver a verificarse contra la documentación oficial antes de una futura separación física; la frontera `cacheDb` permite hacer el cambio en un punto controlado cuando el acceso elegido esté aprobado.

## Criterio de cierre de Phase J

Phase J queda completamente cerrada solo cuando:

- los callsites temporales pasan por `cacheDb`;
- `cacheDb` apunta físicamente a `atlas-cache` con un acceso server-side aprobado;
- Rules cliente son deny-all para la base nombrada;
- TTL está configurado y la aplicación sigue validando `expiresAt` antes de usar cache;
- smoke tests y métricas confirman que una falla del cache/proveedor no bloquea el editor.

Hasta entonces el código está **preparado para separación**, pero la topología física sigue siendo un checkpoint pendiente.
