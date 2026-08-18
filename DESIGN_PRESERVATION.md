# Contrato de preservación visual

Visual delta: authorized
Authorized scope: barra lateral del editor, timeline visual del itinerario y sombra del borde derecho del panel solicitadas explícitamente el 2026-08-18

La interfaz puede incorporar capacidades nuevas, pero el lenguaje visual de Atlas debe permanecer intacto fuera de cambios visuales solicitados y aprobados explícitamente. Este documento registra tanto los invariantes generales como las excepciones visuales autorizadas.

## Cambio visual autorizado el 2026-08-18

El usuario autorizó explícitamente un rediseño acotado del editor de itinerario con este alcance:

- Sustituir la navegación horizontal de `Itinerario`, `Mis Rutas`, `Notas` y `Moneda` por una barra vertical izquierda.
- Usar fondo `#fdfdfd` para la barra, separadores horizontales cortos y grises entre opciones, y sombreado apenas perceptible.
- Mantener las mismas acciones y estados funcionales de navegación, moneda, viajes guardados e idioma; cambia su ubicación, no su contrato de negocio.
- Representar los trayectos como una timeline vertical sin cambiar el modelo `segment` ni Storage v4.
- Mostrar como nodo fijo superior `segments[0].origin`, usando el banderín azul Atlas existente y sin fechas, noches, costo ni acciones de tramo.
- Mostrar cada `segment.destination` como la ciudad de su fila, con bandera, ciudad, país, fechas en dos líneas, noches derivadas, total del tramo, nota, expandir, eliminar y drag handle.
- Permitir hasta dos líneas para nombres largos de ciudad; el país permanece como texto secundario gris.
- Conectar visualmente el origen y las banderas con una línea vertical gris punteada.
- Añadir una sombra sutil en el borde derecho del panel blanco hacia el mapa.
- Conservar visual y funcionalmente los componentes existentes de `Agregar trayecto`, `Total del viaje`, editor de fechas y editor de gastos.
- Mantener las vistas de contenido de `Mis Rutas` y `Notas`; únicamente cambia su acceso desde la navegación.
- Mantener la cuenta/guardado del topbar y el comportamiento del mapa fuera del ajuste de ancho necesario para alojar la nueva composición del panel.

La continuidad `origin → destination → siguiente origin` se conserva como regla funcional del itinerario. La timeline es una proyección visual del mismo modelo, no una nueva entidad de persistencia.

## Invariantes

- No cambiar paleta, tipografías, tamaños, radios, sombras ni espaciados existentes fuera de cambios visuales solicitados explícitamente.
- No mover, ocultar, eliminar ni redimensionar controles actuales salvo cambios visuales solicitados explícitamente.
- No cambiar la jerarquía visual ni el comportamiento responsive existente fuera de las reglas adaptativas descritas o autorizadas.
- No renombrar clases sin conservar reglas y especificidad equivalentes, salvo cuando una estructura nueva autorizada sustituye explícitamente a la anterior.
- Los nuevos controles deben reutilizar componentes, assets, estados y acciones existentes siempre que sea posible.
- Las reglas de accesibilidad no deben producir cambios visibles salvo foco de teclado cuando corresponda.
- Cualquier modularización CSS debe conservar el orden efectivo de las reglas y el resultado de la cascada fuera del alcance autorizado.
- Ningún rediseño puede introducir rutas alternativas de persistencia, autosave, sincronización, APIs o seguridad.

## Controles incorporados previamente

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
- La nueva timeline del editor usa CSS y los assets de banderas existentes; no añade solicitudes a proveedores externos ni datos persistidos derivados para el conteo de noches.

## Configuración de Google Maps

- El `Map ID` debe utilizar rendering vectorial para que `WebGLOverlayView` pueda compartir el contexto gráfico del basemap.
- El Cloud-based Map Style puede mantener `Landmarks → Illustrated`; los POI ilustrados de Google aparecen cuando Google lo permite por zoom y disponibilidad.
- La capa Atlas no descarga, copia ni reutiliza assets internos de Google Maps; reproduce el enfoque técnico de renderizado en una capa propia con recursos originales.

## Validación requerida

- `npm test`
- `npm run test:rules`
- `npm run test:rules:phase-k-e2e`
- `npm run lint`
- `npm run build`
- Revisión de escritorio y móvil antes de integrar.
- Comparación visual de las pantallas principales en preprod antes de considerar el rediseño cerrado.
