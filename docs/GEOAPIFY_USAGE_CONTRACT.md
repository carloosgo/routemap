# Contrato de uso de Geoapify

Estas reglas son invariantes de arquitectura y deben conservarse en cualquier refactor o funcionalidad nueva.

## Búsqueda y autocompletado

1. Debounce entre 400 y 500 ms; valor estándar actual: 450 ms.
2. No realizar peticiones con menos de 5 caracteres normalizados.
3. Solicitar como máximo 5 resultados.
4. Usar caché cliente por query normalizada, sin acentos, en minúsculas y con `trim`, con TTL de 30 a 90 días.

## Persistencia y recálculo

5. Guardar permanentemente identificador del proveedor, coordenadas y datos normalizados de cada ciudad o lugar. Al reabrir un viaje no se vuelve a geocodificar.
6. Persistir en cada tramo calculado la geometría GeoJSON, distancia, duración, modo, firma de origen/destino/modo y fecha de cálculo.
7. Una ruta persistida se reutiliza mientras su firma coincida. Se invalida exclusivamente cuando cambian las coordenadas de origen, las coordenadas de destino o el modo derivado de transporte. Notas, fechas y cambios de importe que conservan el mismo modo no la invalidan.

## Backend y consumo

8. Todas las llamadas privadas a Geoapify pasan por el rate limiter oficial `@geoapify/request-rate-limiter`.
9. Geocoding, places, detalles y routing pasan por Firebase; la clave privada nunca se expone al cliente. Firestore comparte resultados de caché entre usuarios.
10. Routing solicita únicamente geometría, distancia y duración; no se habilitan elevation, traffic ni detalles que no use el producto.
11. Reverse geocoding se ejecuta solo mediante una acción explícita del usuario.
12. Las importaciones de varias ubicaciones usan el Batch Geocoding API asíncrono de Geoapify, con una sola solicitud de hasta 1,000 entradas por operación autenticada.

## Rutas de Tramos

- El modo de routing se deriva del transporte principal registrado en el tramo: tren o autobús usan `transit`; taxi/automóvil y tramos sin transporte definido usan `drive`.
- Los vuelos no llaman al Routing API porque Geoapify no calcula rutas aéreas. Conservan la curva visual punteada existente.
- El cliente calcula únicamente rutas terrestres o de transporte público que no tengan una ruta válida para su firma actual.
- Las solicitudes se procesan una por una y se espacian para proteger la cuota. Una firma fallida no se repite continuamente durante la misma sesión.
- Dos tramos con la misma firma reutilizan el mismo resultado en memoria; el backend además mantiene una caché compartida en Firestore.
- El mapa usa primero la geometría persistida. Mientras una ruta falta o se recalcula, conserva la curva visual local como fallback.
- Firestore recibe la geometría como JSON serializado para evitar arreglos anidados no admitidos. Al hidratar el viaje se restaura y valida como `LineString` o `MultiLineString`.
- Cada geometría se limita defensivamente a 20,000 puntos y a 700,000 caracteres serializados para mantener el documento por debajo del límite operativo.

## Separación funcional del mapa

- **Tramos** representa el itinerario general de ciudades y puede mostrar sus rutas persistidas.
- **Lugares** representa los resultados buscados y los lugares guardados por el usuario.
- Al seleccionar Tramos, el mapa muestra exclusivamente ciudades, países visitados y líneas de colores.
- Al seleccionar Lugares, el mapa oculta el trazado de Tramos y muestra exclusivamente la búsqueda y los lugares guardados.
- Las rutas actuales pertenecen a cada tramo de ciudad a ciudad. No existe todavía un modelo de conexiones independientes entre lugares guardados.

## Seguridad y control de costos

- Todas las callable functions aceptan activación declarativa de Firebase App Check mediante `ENFORCE_APP_CHECK`.
- El cliente prepara reCAPTCHA Enterprise mediante `VITE_FIREBASE_APPCHECK_SITE_KEY`.
- App Check se habilita en modo observación antes de activar enforcement.
- Cada endpoint aplica una cuota compartida en Firestore por UID o hash de IP.
- Las Functions tienen límites explícitos de instancias, concurrencia y tiempo de ejecución.
- Batch exige sesión autenticada, registra el propietario del job y nunca devuelve la URL del proveedor que contiene la API key.
- Las claves de caché y las IP no se guardan en texto claro.
- Las entradas de caché y control de cuota incluyen `expiresAt` para configurar TTL administrado en Firestore.
- Los documentos de tramo aceptan únicamente los campos de ruta definidos; no guardan respuestas completas del proveedor ni instrucciones de navegación.

## Estado actual

- Implementado: debounce de 450 ms, mínimo de 5 caracteres, límite de 5, normalización, caché cliente de 60 días, identificadores y coordenadas persistentes, proxy Firebase, caché compartida, rate limiter oficial, detalles de lugares por proxy, App Check preparado, cuotas compartidas, Batch API real y capas independientes de Tramos y Lugares.
- Implementado: routing por tramo con firma estable, invalidación selectiva, cálculo gradual, reutilización en memoria, persistencia en almacenamiento local y Firestore, serialización segura de GeoJSON y representación de la geometría guardada en MapLibre.
- Pendiente para una fase posterior: modelo opcional de conexiones entre lugares guardados y selección explícita de modos como caminata o bicicleta.
- Pendiente operativo: activar App Check en Firebase después de observar métricas y configurar políticas TTL de Firestore para `expiresAt`.

Toda modificación relacionada debe incluir pruebas automatizadas que demuestren que estas invariantes siguen vigentes.
