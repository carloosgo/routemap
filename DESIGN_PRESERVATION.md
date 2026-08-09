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
- Landmarks editoriales del itinerario: se muestran únicamente en la vista `segments` mediante una sola `WebGLOverlayView`; dejan de formar parte del DOM/CSS de los `AdvancedMarkerElement` de ciudad.
- Primera colección curada: París/Torre Eiffel, Fráncfort/skyline, Múnich/Frauenkirche, Berlín/Puerta de Brandeburgo, Ámsterdam/casas de canal, Bruselas/Atomium y Barcelona/Sagrada Familia.
- Los SVG se redibujan con siluetas arquitectónicas reconocibles, masas visuales y espacios negativos legibles a tamaño de mapa. Cada recurso declara una superficie vectorial cuadrada y se rasteriza a textura de 256 × 256 px para el renderer, conservando el SVG como fuente.
- El renderer mantiene el landmark en tamaño de pantalla independiente del zoom: base de 46 px en escritorio, 40 px en tablet/móvil y 36 px en pantallas estrechas, con un incremento pequeño al acercarse.
- La capa aplica prioridad editorial y detección de colisiones en pantalla. Cuando dos ilustraciones se pisan, conserva la de mayor prioridad en lugar de superponerlas.
- La capa Atlas permanece visible en la vista general y realiza un handoff gradual entre zoom 12.25 y 13.5; a partir de ahí desaparece para dejar espacio a los `Illustrated landmark style` nativos de Google cuando estén disponibles.

## Rendimiento

- Se mantiene un único `AdvancedMarkerElement` por ciudad para puntos, inicio y final. Los landmarks no crean markers ni nodos DOM adicionales.
- Todos los landmarks se dibujan como quads en una única `WebGLOverlayView`, compartiendo el contexto WebGL del mapa vectorial que expone Google Maps Platform.
- Cada asset visible crea como máximo una textura WebGL cacheada; se reutiliza mientras viva el mapa y usa mipmaps para mantener definición al reducirse.
- El tamaño se calcula en píxeles CSS y se convierte al `devicePixelRatio` real del framebuffer, evitando que pantallas Retina/iOS/Android dibujen la ilustración a baja resolución.
- La detección de colisiones trabaja únicamente sobre la colección curada visible y su coste es despreciable para decenas de landmarks.
- Los SVG son assets locales; no se añaden solicitudes a Places, Routes, Geocoding ni proveedores externos para renderizarlos.
- Una ciudad sin landmark registrado conserva únicamente su punto pequeño, permitiendo ampliar cobertura internacional de forma controlada.

## Configuración de Google Maps

- El `Map ID` debe utilizar rendering vectorial para que `WebGLOverlayView` pueda compartir el contexto gráfico del basemap.
- El Cloud-based Map Style puede mantener `Landmarks → Illustrated`; los POI ilustrados de Google aparecen cuando Google lo permite por zoom y disponibilidad.
- La capa Atlas no descarga, copia ni reutiliza assets internos de Google Maps; reproduce el enfoque técnico de renderizado en una capa propia con recursos originales.

## Validación requerida

- `npm test`
- `npm run lint`
- `npm run build`
- Revisión de escritorio y móvil antes de integrar.
- Comparación visual de las pantallas principales cuando el entorno de despliegue esté disponible.
