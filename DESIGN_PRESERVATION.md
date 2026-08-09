# Contrato de preservación visual

Visual delta: none

La interfaz puede incorporar capacidades nuevas, pero el lenguaje visual de Atlas debe permanecer intacto. Los controles añadidos reutilizan componentes, dimensiones, espaciados, iconografía y estados ya existentes. Los cambios visuales enumerados abajo fueron solicitados y aprobados explícitamente para el mapa del itinerario.

## Invariantes

- No cambiar paleta, tipografías, tamaños, radios, sombras ni espaciados existentes fuera de cambios visuales solicitados explícitamente.
- No mover, ocultar, eliminar ni redimensionar controles actuales salvo cambios visuales solicitados explícitamente.
- No cambiar la jerarquía visual ni el comportamiento responsive existente fuera de las reglas adaptativas descritas abajo.
- No renombrar clases sin conservar reglas y especificidad equivalentes.
- Los nuevos controles deben reutilizar componentes, dimensiones y estados visuales existentes.
- Las reglas de accesibilidad no deben producir cambios visibles salvo foco de teclado cuando corresponda.
- Cualquier modularización CSS debe conservar el orden efectivo de las reglas y el resultado de la cascada.

## Controles incorporados

- Selector `KM / MI`: reutiliza `topmenu`, `topitem`, `dropdown` y `dropdown__opt`.
- Instalación PWA: reutiliza `topitem` y solo aparece cuando el navegador emite `beforeinstallprompt`.
- Búsqueda de lugares: conserva los componentes visuales existentes; la sugerencia seleccionada ahora se enfoca directamente y la confirmación permanece anclada a su marcador.
- Marcador final del itinerario: sustituye únicamente el último endpoint numerado por un banderín SVG de 18 × 18 px, usando la paleta de iconos del sistema (`#11c7dc`, `#14394b`, `#fff3d6`). El marcador inicial numerado se conserva.
- Marcadores intermedios del itinerario: reducen su núcleo visual a 7 × 7 px más borde fino para disminuir saturación sin perder la codificación cromática de cada tramo.
- Landmarks de ciudades principales: se renderizan como SVG locales de 18 × 18 px dentro del mismo `AdvancedMarkerElement` existente mediante pseudo-elemento CSS; no crean markers, listeners ni llamadas de red adicionales a Google Maps.
- Primera colección curada: París/Torre Eiffel, Fráncfort/skyline, Múnich/Frauenkirche, Berlín/Puerta de Brandeburgo, Ámsterdam/casas de canal, Bruselas/Atomium y Barcelona/Sagrada Familia.
- Reglas responsive de densidad: hasta 720 px los landmarks bajan a 16 × 16 px y se ocultan Fráncfort y Bruselas; hasta 480 px también se oculta Múnich. París, Berlín, Ámsterdam y Barcelona conservan identidad visual en los tamaños más estrechos.
- Los offsets se ajustan por ciudad para reducir colisiones visuales con marcadores cercanos, incluido el clúster Benelux y el banderín final de Barcelona.

## Rendimiento

- Los landmarks son recursos SVG estáticos, sin filtros, gradientes, animaciones ni rasterización previa.
- Se mantiene un único `AdvancedMarkerElement` por ciudad; el landmark no duplica objetos del mapa.
- No se añaden solicitudes a Places, Routes, Geocoding ni otros proveedores.
- La colección es explícita y curada: una ciudad sin landmark registrado conserva únicamente su punto pequeño, lo que permite ampliar cobertura mundial de forma controlada.

## Validación requerida

- `npm test`
- `npm run lint`
- `npm run build`
- Revisión de escritorio y móvil antes de integrar.
- Comparación visual de las pantallas principales cuando el entorno de despliegue esté disponible.
