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
- Marcadores intermedios del itinerario: mantienen un núcleo visual de 7 × 7 px más borde fino para disminuir saturación sin perder la codificación cromática de cada tramo.
- Landmarks editoriales del itinerario: se muestran únicamente en la vista `segments` porque reutilizan el mismo `AdvancedMarkerElement` de las ciudades del itinerario. No se añaden markers separados ni se modifica la vista `places`.
- Primera colección curada: París/Torre Eiffel, Fráncfort/skyline, Múnich/Frauenkirche, Berlín/Puerta de Brandeburgo, Ámsterdam/casas de canal, Bruselas/Atomium y Barcelona/Sagrada Familia.
- Los landmarks son mini-ilustraciones SVG de 64 × 64 de origen, con rellenos, contornos, detalles arquitectónicos y sombreado vectorial simple. Se renderizan a 42 × 42 px en escritorio, 36 × 36 px hasta 720 px y 32 × 32 px hasta 420 px.
- Los offsets se ajustan por ciudad para reducir colisiones con la línea de ruta, el marcador inicial/final y el clúster Benelux. En pantallas de hasta 560 px se ocultan Fráncfort y Bruselas para preservar legibilidad; las ciudades principales restantes siguen visibles desde la vista inicial.
- Google Maps puede seguir mostrando sus `Illustrated landmark style` nativos cuando el nivel de zoom lo permita; la capa Atlas cubre específicamente la vista general del itinerario donde esos landmarks nativos todavía no aparecen.

## Rendimiento

- Se mantiene un único `AdvancedMarkerElement` por ciudad; el landmark se pinta como parte visual del mismo marker y no duplica objetos del mapa.
- Los siete SVG pesan aproximadamente 1–2 KB cada uno y se sirven como assets locales del bundle, sin solicitudes a Places, Routes, Geocoding ni proveedores externos.
- Los SVG no usan animaciones ni filtros internos pesados; solo gradientes vectoriales simples. La separación del fondo usa una `drop-shadow` CSS pequeña.
- No se añaden listeners, timers ni cálculos por frame para la capa de landmarks.
- La colección es explícita y curada: una ciudad sin landmark registrado conserva únicamente su punto pequeño, permitiendo ampliar cobertura internacional de forma controlada.
- En móvil se aplica reducción de tamaño y supresión de landmarks secundarios para evitar saturación y reducir trabajo de pintura.

## Configuración de Google Maps

- El `Map ID` puede mantener asociado un Cloud-based Map Style con `Landmarks → Illustrated`; esos POI ilustrados siguen siendo propiedad del basemap y aparecen cuando Google lo permite por zoom y disponibilidad.
- La capa Atlas no intenta descargar, copiar ni reutilizar assets gráficos internos de Google Maps.

## Validación requerida

- `npm test`
- `npm run lint`
- `npm run build`
- Revisión de escritorio y móvil antes de integrar.
- Comparación visual de las pantallas principales cuando el entorno de despliegue esté disponible.
