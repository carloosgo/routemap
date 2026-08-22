# Contrato de búsqueda, geocodificación y Geoapify

Estas reglas son invariantes de arquitectura. Tramos y Lugares son dominios independientes que únicamente comparten el lienzo de MapLibre.

## Secretos separados

- `GEOAPIFY_CITY_API_KEY` pertenece exclusivamente a `geoapifyCityAutocomplete`.
- `GEOAPIFY_API_KEY` pertenece a búsqueda general, detalles, reverse geocoding, routing y batch.
- Ninguno de los dos secretos se expone al navegador, se guarda en `.env.local`, se registra en logs o se reutiliza fuera de su dominio.

## Dominio de Tramos

- El autocompletado de origen y destino busca exclusivamente ciudades.
- Vive bajo `CityAutocomplete` y `modules/geocoding`.
- Usa `geoapifyCityAutocomplete`, que fuerza `type=city` en el servidor.
- Política: mínimo 3 caracteres, máximo 120, debounce 450 ms, máximo 5 resultados y caché cliente de 60 días.
- Backend: colección `citySearchCache`, cuota `geoapify-city-autocomplete` y secreto `GEOAPIFY_CITY_API_KEY`.
- Una selección persiste identificador, nombre, nombre mostrado, país, código de país y coordenadas.
- Los tramos contienen ciudades, fechas, gastos y nota. No contienen lugares guardados ni rutas reales.
- El mapa de Tramos usa curvas visuales locales y no llama al Routing API.
- Los lugares guardados en tramos de viajes antiguos se migran a `trip.places`; el modelo actual nunca vuelve a anidarlos.

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

## Routing futuro

- `geoapifyRoute` está protegido y disponible, pero no tiene cliente activo.
- No existe `segment.route` ni llamada automática al editar un tramo.
- Las rutas futuras conectarán lugares guardados dentro de Lugares.
- Tendrán modelo, persistencia y capas separados de `segments` y `places`.
- Solo solicitarán geometría, distancia y duración.

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
- Las cachés y cuotas incluyen `expiresAt`.
- `geoapifyCityAutocomplete` mantiene `enforceAppCheck: false` explícito hasta completar la activación gradual de App Check.
- Las reglas Firestore impiden acceso del cliente a colecciones internas y rechazan routing o lugares anidados en tramos.

## Estado actual

- Implementado y desplegado: autocomplete privado de ciudades con clave exclusiva.
- Eliminado: acceso directo del navegador a Nominatim.
- Implementado: búsqueda general, detalles, marcadores, cachés y capas separadas.
- Implementado: migración defensiva de lugares legados sin perder lugares actuales.
- Preparado pero desconectado: endpoint backend de routing.
- Pendiente posterior: conexiones entre lugares guardados, selección de transporte, persistencia de rutas y representación propia.

Toda modificación relacionada debe incluir pruebas automatizadas que demuestren que ambos dominios siguen separados.
