# Contrato de uso de Geoapify

Estas reglas son invariantes de arquitectura y deben conservarse en cualquier refactor o funcionalidad nueva.

## Búsqueda y autocompletado

1. Debounce entre 400 y 500 ms; valor estándar actual: 450 ms.
2. No realizar peticiones con menos de 5 caracteres normalizados.
3. Solicitar como máximo 5 resultados.
4. Usar caché cliente por query normalizada, sin acentos, en minúsculas y con `trim`, con TTL de 30 a 90 días.

## Persistencia y recálculo

5. Guardar permanentemente identificador, coordenadas y datos normalizados de cada lugar. Al reabrir un viaje no se vuelve a geocodificar.
6. Guardar por tramo la geometría GeoJSON de la ruta, distancia, duración, modo y firma de origen/destino/modo.
7. Recalcular exclusivamente cuando cambie origen, destino o modo. Cambios en nombre, notas, fechas y gastos que no alteran el modo de transporte no invalidan la ruta.

## Backend y consumo

8. Todas las llamadas privadas a Geoapify pasan por el rate limiter oficial `@geoapify/request-rate-limiter`.
9. Geocoding, places, detalles y routing pasan por Firebase; la clave privada nunca se expone al cliente. Firestore comparte resultados de caché entre usuarios.
10. Routing solicita únicamente geometría, distancia y duración; no se habilitan elevation, traffic ni detalles que no use el producto.
11. Reverse geocoding se ejecuta solo mediante una acción explícita del usuario.
12. Las importaciones de varias ubicaciones usan el Batch Geocoding API asíncrono de Geoapify, con una sola solicitud de hasta 1,000 entradas por operación autenticada.

## Seguridad y control de costos

- Todas las callable functions aceptan activación declarativa de Firebase App Check mediante `ENFORCE_APP_CHECK`.
- El cliente prepara reCAPTCHA Enterprise mediante `VITE_FIREBASE_APPCHECK_SITE_KEY`.
- App Check se habilita en modo observación antes de activar enforcement.
- Cada endpoint aplica una cuota compartida en Firestore por UID o hash de IP.
- Las Functions tienen límites explícitos de instancias, concurrencia y tiempo de ejecución.
- Batch exige sesión autenticada, registra el propietario del job y nunca devuelve la URL del proveedor que contiene la API key.
- Las claves de caché y las IP no se guardan en texto claro.
- Las entradas de caché y control de cuota incluyen `expiresAt` para configurar TTL administrado en Firestore.

## Implementación de rutas persistentes

- La firma usa coordenadas de origen, coordenadas de destino y modo con precisión de seis decimales.
- `drive` se usa por defecto; tren y autobús se traducen a `transit`; los vuelos conservan la curva visual local y no consumen Routing API.
- Mientras llega una ruta nueva, el mapa mantiene la curva adaptativa anterior como respaldo visual.
- Al recibir la ruta se guardan `geometry`, `distance`, `duration`, `mode`, `signature`, `calculatedAt` y `source` dentro del tramo.
- Firestore recibe la geometría GeoJSON serializada como JSON porque no admite arreglos anidados; al leer el viaje se restaura el objeto GeoJSON completo.
- Modificar notas, fechas, hospedaje, comida, lugares o nombre del viaje conserva la ruta existente.
- Cambiar cantidades de transporte solo invalida la ruta cuando cambia el modo dominante resultante.

## Estado actual

- Implementado: debounce de 450 ms, mínimo de 5 caracteres, límite de 5, normalización, caché cliente de 60 días, coordenadas persistentes, geometrías persistentes por tramo, comparación de firma, proxy Firebase, caché compartida, rate limiter oficial, detalles de lugares por proxy, routing sin extras, App Check preparado, cuotas compartidas y Batch API real.
- Pendiente operativo: activar App Check en Firebase después de observar métricas y configurar políticas TTL de Firestore para `expiresAt`.

Toda modificación relacionada debe incluir pruebas automatizadas que demuestren que estas invariantes siguen vigentes.
