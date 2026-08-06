# Contrato de búsqueda, geocodificación y Geoapify

Estas reglas son invariantes de arquitectura. Tramos y búsqueda general son dos dominios independientes que únicamente comparten el lienzo de MapLibre.

## Dominio de Tramos

- El autocompletado de origen y destino busca exclusivamente ciudades para construir el itinerario.
- Vive bajo `CityAutocomplete` y `modules/geocoding`; no importa `usePlaceSearch`, `geoapifyClient`, marcadores de resultados ni componentes de Lugares.
- Usa el endpoint exclusivo `geoapifyCityAutocomplete`, que fuerza `type=city` en Geoapify.
- Su política propia es: mínimo 3 caracteres normalizados, debounce de 450 ms, máximo 5 resultados y caché local de 60 días.
- El backend utiliza la colección independiente `citySearchCache` y la cuota `geoapify-city-autocomplete`.
- Una selección produce únicamente: identificador del proveedor, nombre, nombre mostrado, país, código de país y coordenadas.
- La ciudad seleccionada queda persistida en el tramo; al reabrir el viaje no se vuelve a consultar.
- Los tramos persisten ciudades, fechas, gastos y nota. No contienen lugares guardados, resultados generales ni rutas reales.
- El mapa de Tramos usa curvas visuales locales, puntos de ciudades, colores y países visitados. No llama al Routing API.
- Los vuelos siguen representándose con línea punteada; los demás tramos con la curva visual correspondiente.
- Los viajes antiguos que guardaron lugares dentro de un tramo se migran al arreglo general `trip.places`, pero el modelo actual nunca vuelve a crearlos dentro del tramo.

Aunque Ciudades y Lugares usen la misma cuenta y secreto de Geoapify, conservan clientes, endpoints, cachés, cuotas, modelos y pruebas independientes.

## Dominio de búsqueda general

- El campo general busca hoteles, restaurantes, estaciones, museos, direcciones y cualquier otro lugar.
- Vive bajo `PlaceSearchForm`, `usePlaceSearch` y `modules/places`.
- Solo se muestra y ejecuta cuando la vista activa es Lugares.
- No lee segmentos, origen, destino, ciudades conocidas ni gastos para modificar o contextualizar la consulta.
- La consulta enviada es la escrita por el usuario. Si posteriormente se agrega sesgo geográfico, debe provenir del viewport del mapa o de una elección explícita dentro de Lugares, nunca de Tramos.
- Los resultados, sugerencias, marcadores, imágenes y confirmaciones pertenecen únicamente a búsqueda general.
- Los lugares confirmados se guardan en `trip.places`; nunca dentro de `segment`.

## Reglas de búsqueda general

1. Debounce entre 400 y 500 ms; valor estándar actual: 450 ms.
2. No realizar peticiones con menos de 5 caracteres normalizados.
3. Solicitar como máximo 5 resultados.
4. Usar caché cliente por consulta normalizada, sin acentos, en minúsculas y con `trim`, con TTL de 30 a 90 días.
5. Guardar permanentemente identificador, coordenadas y datos normalizados de cada lugar confirmado. Al reabrir un viaje no se vuelve a geocodificar.

## Routing futuro

- El endpoint backend `geoapifyRoute` está protegido y disponible, pero no tiene cliente activo.
- No existe `segment.route`, hook de rutas de Tramos ni llamada automática al editar origen, destino o gastos.
- Las futuras rutas conectarán lugares guardados dentro del dominio de búsqueda general.
- Esas conexiones tendrán un modelo persistente propio, separado de `segments` y de `places`.
- Por conexión se almacenarán geometría GeoJSON, distancia, duración, modo y firma de extremos/modo.
- Solo se recalcularán cuando cambie uno de sus lugares extremos o el modo elegido.
- Routing solicitará únicamente geometría, distancia y duración; no elevation, traffic ni detalles no usados.

## Backend y consumo

- Todas las llamadas privadas a Geoapify pasan por Firebase y por el rate limiter oficial `@geoapify/request-rate-limiter`.
- La clave privada nunca se expone al navegador.
- Firestore comparte resultados de caché entre usuarios sin revelar la consulta en texto claro.
- Ciudades usa `citySearchCache`; búsqueda general usa `placeSearchCache` y `geocodeCache`.
- Reverse geocoding se ejecuta únicamente mediante una acción explícita del usuario.
- Las importaciones de varias ubicaciones usan el Batch Geocoding API asíncrono, con una solicitud de hasta 1,000 entradas por operación autenticada.

## Separación dentro del mapa

- **Tramos** muestra exclusivamente ciudades, países visitados y líneas visuales del itinerario.
- **Lugares** oculta las capas de Tramos y muestra exclusivamente búsqueda general, resultados y lugares guardados.
- `RouteMap` puede recibir ambos conjuntos porque administra el lienzo compartido, pero las operaciones de un dominio no modifican el estado del otro.
- La búsqueda general no usa las ciudades de Tramos como contexto.
- Guardar o eliminar un lugar no altera segmentos.
- Editar un tramo no dispara búsqueda general, detalles de lugares ni routing.

## Seguridad y control de costos

- Todas las callable functions aceptan activación declarativa de Firebase App Check mediante `ENFORCE_APP_CHECK`.
- El cliente prepara reCAPTCHA Enterprise mediante `VITE_FIREBASE_APPCHECK_SITE_KEY`.
- App Check se habilita en modo observación antes de activar enforcement.
- Cada endpoint aplica cuota compartida en Firestore por UID o hash de IP.
- Las Functions tienen límites explícitos de instancias, concurrencia y tiempo de ejecución.
- Batch exige sesión autenticada, registra el propietario del job y nunca devuelve la URL del proveedor con la API key.
- Las entradas de caché y cuota incluyen `expiresAt` para configurar TTL administrado.
- Las reglas de Firestore rechazan campos de routing o lugares anidados dentro de documentos de tramo.

## Estado actual

- Implementado: autocompletado privado de ciudades mediante Firebase y Geoapify `type=city`, con mínimo 3, debounce 450 ms, límite 5, caché local y compartida, cuota propia e identificador persistido.
- Eliminado: acceso directo del navegador al Nominatim público.
- Implementado: búsqueda general con debounce de 450 ms, mínimo de 5 caracteres, límite de 5, consulta literal, caché cliente de 60 días, proxy Firebase, detalles de lugares y marcadores propios.
- Implementado: capas mutuamente excluyentes y migración defensiva de lugares legados fuera de los tramos.
- Preparado pero desconectado: endpoint backend de routing.
- Pendiente para una fase posterior: modelo de conexiones entre lugares guardados, selección de transporte, persistencia de rutas y representación propia en la vista Lugares.
- Pendiente operativo: desplegar `geoapifyCityAutocomplete`, activar App Check después de observar métricas y configurar TTL de Firestore para `citySearchCache.expiresAt` y las demás colecciones internas.

Toda modificación relacionada debe incluir pruebas automatizadas que demuestren que ambos dominios siguen separados.
