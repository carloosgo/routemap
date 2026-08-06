# Contrato de uso de Geoapify

Estas reglas son invariantes de arquitectura y deben conservarse en cualquier refactor o funcionalidad nueva.

## Búsqueda y autocompletado

1. Debounce entre 400 y 500 ms; valor estándar actual: 450 ms.
2. No realizar peticiones con menos de 5 caracteres normalizados.
3. Solicitar como máximo 5 resultados.
4. Usar caché cliente por query normalizada, sin acentos, en minúsculas y con `trim`, con TTL de 30 a 90 días.

## Persistencia y recálculo

5. Guardar permanentemente identificador, coordenadas y datos normalizados de cada lugar. Al reabrir un viaje no se vuelve a geocodificar.
6. En la futura fase de rutas entre lugares guardados, persistir por conexión la geometría GeoJSON, distancia, duración, modo y firma de origen/destino/modo.
7. Esa futura ruta se recalculará exclusivamente cuando cambie alguno de sus lugares extremos o el modo de transporte. Los cambios en tramos, notas, fechas o gastos no deberán invalidarla.

## Backend y consumo

8. Todas las llamadas privadas a Geoapify pasan por el rate limiter oficial `@geoapify/request-rate-limiter`.
9. Geocoding, places, detalles y routing pasan por Firebase; la clave privada nunca se expone al cliente. Firestore comparte resultados de caché entre usuarios.
10. Routing solicita únicamente geometría, distancia y duración; no se habilitan elevation, traffic ni detalles que no use el producto.
11. Reverse geocoding se ejecuta solo mediante una acción explícita del usuario.
12. Las importaciones de varias ubicaciones usan el Batch Geocoding API asíncrono de Geoapify, con una sola solicitud de hasta 1,000 entradas por operación autenticada.

## Separación funcional del mapa

- **Tramos** representa el itinerario general de ciudades. Sus puntos y líneas de colores son un trazado visual local y no consumen Routing API.
- **Lugares** representa los resultados buscados y los lugares guardados por el usuario.
- Al seleccionar Tramos, el mapa muestra exclusivamente ciudades, países visitados y líneas de colores.
- Al seleccionar Lugares, el mapa oculta el trazado de Tramos y muestra exclusivamente la búsqueda y los lugares guardados.
- Las futuras rutas por automóvil, transporte público, caminata u otros modos conectarán lugares guardados; nunca sustituirán ni modificarán el trazado visual de Tramos.
- No se añadirá una estructura persistente de conexiones entre lugares hasta iniciar formalmente esa fase.
- El endpoint backend `geoapifyRoute` permanece aislado y sin cliente activo para conservar el endurecimiento de seguridad ya realizado sin activar consumo prematuro.

## Seguridad y control de costos

- Todas las callable functions aceptan activación declarativa de Firebase App Check mediante `ENFORCE_APP_CHECK`.
- El cliente prepara reCAPTCHA Enterprise mediante `VITE_FIREBASE_APPCHECK_SITE_KEY`.
- App Check se habilita en modo observación antes de activar enforcement.
- Cada endpoint aplica una cuota compartida en Firestore por UID o hash de IP.
- Las Functions tienen límites explícitos de instancias, concurrencia y tiempo de ejecución.
- Batch exige sesión autenticada, registra el propietario del job y nunca devuelve la URL del proveedor que contiene la API key.
- Las claves de caché y las IP no se guardan en texto claro.
- Las entradas de caché y control de cuota incluyen `expiresAt` para configurar TTL administrado en Firestore.

## Estado actual

- Implementado: debounce de 450 ms, mínimo de 5 caracteres, límite de 5, normalización, caché cliente de 60 días, coordenadas persistentes, proxy Firebase, caché compartida, rate limiter oficial, detalles de lugares por proxy, App Check preparado, cuotas compartidas, Batch API real y capas independientes de Tramos y Lugares.
- Preparado pero no conectado: endpoint backend de routing con geometría, distancia y duración.
- Pendiente para una fase posterior: modelo de conexiones entre lugares guardados, selección de transporte, persistencia de sus rutas y representación propia en el mapa.
- Pendiente operativo: activar App Check en Firebase después de observar métricas y configurar políticas TTL de Firestore para `expiresAt`.

Toda modificación relacionada debe incluir pruebas automatizadas que demuestren que estas invariantes siguen vigentes.
