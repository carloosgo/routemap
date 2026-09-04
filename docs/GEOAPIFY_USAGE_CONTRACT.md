# Contrato de búsqueda, geocodificación y Geoapify

Estas reglas son invariantes de arquitectura. Tramos y Lugares son dominios independientes que comparten el lienzo activo de Google Maps, pero no comparten estado de búsqueda ni persistencia de proveedor.

## Secretos separados

- `GEOAPIFY_CITY_API_KEY` pertenece exclusivamente a `geoapifyCityAutocomplete`.
- `GEOAPIFY_API_KEY` pertenece a búsqueda general, detalles, reverse geocoding, routing y batch.
- Ninguno de los dos secretos se expone al navegador, se guarda en `.env.local`, se registra en logs o se reutiliza fuera de su dominio.

## Dominio de Tramos

- El autocompletado de origen y destino busca exclusivamente ciudades.
- Vive bajo `CityAutocomplete` y `modules/geocoding`.
- Usa `geoapifyCityAutocomplete`, que consulta primero el catálogo canónico Atlas y usa Geoapify Search como descubrimiento/revalidación cuando corresponde.
- La consulta al proveedor fuerza `type=city`, `bias=countrycode:none`, idioma `es|en` y máximo 5 resultados.
- Política cliente: mínimo 3 caracteres, máximo 120, debounce 450 ms, máximo 5 resultados y caché browser acotada de 60 días.
- Provider cache backend: `citySearchCache`, cuota `geoapify-city-autocomplete` y secreto `GEOAPIFY_CITY_API_KEY`.
- Catálogo server-only: `cityCatalog`, `cityCatalogProviderRefs` y `cityCatalogQueries`; no son TTL/provider cache.
- Una selección persiste únicamente el City canónico de Storage v4: identificador, nombre, nombre mostrado, país, código de país y coordenadas.
- Región, referencias de proveedor, atribución y freshness permanecen fuera del City persistido en el viaje.
- Los tramos contienen ciudades, fechas, gastos y nota. No contienen lugares guardados ni rutas reales.
- El mapa de Tramos usa curvas visuales locales y no llama al Routing API al editar una ciudad.
- Los lugares guardados en tramos de viajes antiguos se migran a `trip.places`; el modelo actual nunca vuelve a anidarlos.

## Catálogo canónico de ciudades

El catálogo de ciudades es referencia durable de Atlas, no una copia renombrada de `citySearchCache`.

Flujo:

```text
browser cache
 -> cityCatalogQueries
    -> fresh: Atlas City snapshots
    -> miss/stale: Geoapify Search/shared cache
       -> normalización/dedupe/localización
       -> cityCatalog + provider ref mapping
       -> refresh cityCatalogQueries
```

- `atlasCityId` es opaco y generado por Atlas/Firestore; no se deriva del ID de Geoapify.
- `cityCatalogProviderRefs` enlaza IDs de proveedor con Atlas mediante fingerprints SHA-256 y transacciones.
- La consulta normalizada no se persiste en claro; `cityCatalogQueries` usa fingerprint.
- Las proyecciones se revalidan a 180 días; no usan `expiresAt` ni TTL porque son referencia materializada, no provider cache.
- Un stale projection sólo se utiliza como fallback si el proveedor falla durante revalidación.
- Viajes históricos con IDs de proveedor siguen válidos. No existe migración destructiva obligatoria.
- Los nuevos resultados materializados pueden devolver IDs Atlas sin cambiar el shape City permitido por Storage v4.
- La atribución de datasource recibida de Geoapify se conserva sanitizada en la referencia canónica, no dentro del viaje.

La especificación completa vive en `docs/CITY_CATALOG_ARCHITECTURE.md`.

## Dominio de Lugares

- Busca hoteles, restaurantes, estaciones, museos, direcciones y otros lugares.
- Vive bajo `PlaceSearchForm`, `usePlaceSearch` y `modules/places`.
- Solo se ejecuta cuando la vista activa es Lugares.
- No lee segmentos, origen, destino, ciudades conocidas ni gastos para contextualizar consultas.
- Política: mínimo 5 caracteres, máximo 160, debounce 450 ms, máximo 5 resultados y caché cliente de 60 días.
- Backend: `placeSearchCache`, `geocodeCache`, `placeDetailsCache` y secreto `GEOAPIFY_API_KEY`.
- Los lugares confirmados se guardan en `trip.places`, nunca dentro de un segmento.

## Reverse geocoding

- Se ejecuta únicamente por una acción explícita del usuario.
- Valida coordenadas antes de llamar al proveedor.
- La respuesta se reduce al modelo normalizado de lugar; no se devuelve el payload completo de Geoapify.
- La caché usa una clave versionada para no reutilizar respuestas antiguas con forma diferente.

## Batch geocoding

- Exige sesión autenticada.
- Acepta entre 1 y 1,000 entradas.
- Cada entrada requiere entre 5 y 160 caracteres.
- El job queda asociado al UID y expira mediante `expiresAt`.
- Nunca se devuelve una URL que contenga la API key.

## Routing

- `geoapifyRoute` permanece separado del autocomplete de ciudades.
- No existe `segment.route` ni llamada automática al editar un tramo.
- Las rutas de Mis Rutas conectan lugares guardados dentro de Lugares y mantienen modelo/persistencia/capas separados de `segments`.
- Los flujos de routing sólo solicitan la información necesaria para estimación/geometría conforme al proveedor activo.

## Separación dentro del mapa

- Tramos muestra ciudades, países visitados y líneas del itinerario.
- Lugares oculta las capas de Tramos y muestra resultados y lugares guardados.
- `RouteMap` administra el lienzo compartido, pero las operaciones de un dominio no modifican el estado del otro.
- Guardar o eliminar un lugar no altera segmentos.
- Editar un tramo no dispara búsqueda general, detalles ni routing.

## Seguridad y control de costos

- Las llamadas privadas pasan por Firebase Functions y el rate limiter oficial.
- Cada endpoint aplica cuota compartida por UID, hash de IP o fingerprint anónimo.
- Las Functions tienen límites explícitos de instancias, concurrencia y timeout.
- Provider caches y cuotas conservan `expiresAt`; el catálogo canónico no se incluye en TTL.
- `geoapifyCityAutocomplete` mantiene `enforceAppCheck: false` explícito hasta completar la activación gradual de App Check.
- Las reglas Firestore impiden acceso del cliente a caches y colecciones del catálogo interno.
- El callable registra métricas estructuradas de hit/miss/fallback sin registrar el texto crudo de búsqueda.
- Si falla el catálogo, el proveedor sigue disponible; si falla una escritura de catálogo, el resultado normalizado del proveedor sigue siendo utilizable.

## Versionado del cambio de identidad

El provider cache de ciudad y el browser cache pasan a v8 porque:

1. el payload compartido conserva atribución necesaria para materializar el catálogo;
2. los resultados pueden cambiar de provider ID a `atlasCityId`;
3. reutilizar v7 cruzaría una frontera de identidad incompatible.

```text
server: city:v8:...
browser: atlas:geoapify-city-cache:v8
```

## Estado actual de código

- Implementado: autocomplete privado de ciudades con clave exclusiva y Geocoding Search.
- Implementado: normalización/localización/deduplicación v7 conservada como capa de ingreso.
- Implementado: catálogo canónico Atlas y provider reference mapping.
- Implementado: query projection server-only con revalidación y stale-provider-outage fallback.
- Implementado: cache boundary v8 para IDs Atlas.
- Implementado: acceso cliente deny-all al catálogo cubierto por tests de Rules.
- Eliminado: acceso directo del navegador a Nominatim.
- Implementado: búsqueda general, detalles, marcadores, cachés y capas separadas.
- Implementado: migración defensiva de lugares legados sin perder lugares actuales.
- La activación cloud de una versión nueva de `geoapifyCityAutocomplete` requiere deployment; un commit por sí solo no demuestra deploy.

Toda modificación relacionada debe incluir pruebas automatizadas que demuestren que Tramos/Lugares siguen separados y que provider cache, catálogo de referencia y datos canónicos del usuario no se mezclan.
