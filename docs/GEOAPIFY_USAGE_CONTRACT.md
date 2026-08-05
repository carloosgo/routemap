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
7. Recalcular exclusivamente cuando cambie origen, destino o modo. Cambios en nombre, notas o gastos no invalidan la ruta.

## Backend y consumo

8. Todas las llamadas privadas a Geoapify pasan por el rate limiter oficial `@geoapify/request-rate-limiter`.
9. Geocoding, places y routing pasan por Firebase; la clave privada nunca se expone al cliente. Firestore comparte resultados de caché entre usuarios.
10. Routing solicita únicamente geometría, distancia y duración; no se habilitan elevation, traffic ni detalles que no use el producto.
11. Reverse geocoding se ejecuta solo mediante una acción explícita del usuario.
12. Las importaciones de varias ubicaciones usan batch geocoding, con un máximo de 1,000 entradas por operación autorizada.

## Estado actual

- Implementado: debounce de 450 ms, mínimo de 5 caracteres, límite de 5, normalización, caché cliente de 60 días, coordenadas persistentes, proxy Firebase, caché compartida, rate limiter, routing sin extras y endpoint batch.
- Pendiente prioritario: persistir geometría de ruta y su firma en el modelo del tramo; impedir recálculos cuando la firma no cambia; mover la consulta de detalles e imágenes de lugares al proxy para que ninguna llamada privada eluda el rate limiter.

Toda modificación relacionada debe incluir pruebas automatizadas que demuestren que estas invariantes siguen vigentes.
