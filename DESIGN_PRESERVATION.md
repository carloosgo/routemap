# Contrato de preservación visual

Visual delta: requested
Requested visual scope: editor navigation rail + connected itinerary timeline requested by the product owner

La interfaz puede incorporar capacidades nuevas, pero el lenguaje visual de Atlas debe permanecer intacto fuera de cambios visuales solicitados explícitamente. Este PR contiene un rediseño deliberado del módulo de itinerario: mueve la navegación del editor a una barra lateral y transforma la lista de tramos en una timeline de ciudades conectadas, sin alterar mapa, persistencia, notas, gastos ni pantallas ajenas al alcance.

## Invariantes

- No cambiar paleta, tipografías, tamaños, radios, sombras ni espaciados existentes fuera de cambios visuales solicitados explícitamente.
- No mover, ocultar, eliminar ni redimensionar controles actuales salvo cambios visuales solicitados explícitamente.
- No cambiar la jerarquía visual ni el comportamiento responsive existente fuera de las reglas adaptativas descritas abajo.
- Los nuevos controles reutilizan las acciones y componentes existentes; no crean una navegación o persistencia paralelas.
- Las reglas de accesibilidad no deben producir cambios visibles salvo foco de teclado cuando corresponda.
- Cualquier modularización CSS debe conservar el orden efectivo de las reglas y el resultado de la cascada fuera del alcance solicitado.

## Rediseño solicitado del editor de itinerario

- `Itinerario`, `Mis Rutas`, `Notas` y `Moneda` pasan de la cabecera horizontal a un rail izquierdo de fondo `#fdfdfd`.
- Cada opción conserva su acción actual y se separa mediante una línea gris corta, tenue y con sombra apenas perceptible.
- El menú de trabajo (`Nuevo viaje`, viajes guardados e idioma) permanece disponible como overflow discreto dentro del mismo rail; no se elimina funcionalidad existente.
- El panel de edición mantiene fondo blanco y añade una sombra tenue en el borde derecho hacia el mapa.
- El itinerario se representa como timeline: un nodo inicial fijo usa `itinerary-start-flag.svg` y cada fila posterior representa `segment.destination`.
- Las banderas se conectan mediante una línea vertical gris punteada. La línea crece con un tramo expandido sin depender de coordenadas absolutas.
- Cada fila conserva las mismas acciones funcionales del segmento: nota, expandir gastos/fechas, eliminar y reordenar.
- Nombre de ciudad puede ocupar hasta dos líneas; país aparece debajo en texto secundario gris.
- Fechas se muestran en dos renglones (`inicio`, `fin`). El conteo de noches se deriva de las fechas y nunca se persiste como dato canónico.
- `Agregar trayecto` y `Total del viaje` conservan su comportamiento y estructura funcional.
- El origen inicial no es un segmento nuevo ni una entidad nueva: se deriva de `segments[0].origin`.
- Reordenar, eliminar o cambiar un destino reencadena los origins internos para que la ruta persistida siga coincidiendo con el orden visual; sólo se actualizan segmentos cuya continuidad cambia.
- En móvil el rail se adapta a navegación horizontal compacta para preservar acceso a las mismas funciones.

## Controles incorporados previamente

- Selector `KM / MI`: reutiliza `topmenu`, `topitem`, `dropdown` y `dropdown__opt`.
- Instalación PWA: reutiliza `topitem` y solo aparece cuando el navegador emite `beforeinstallprompt`.
- Búsqueda de lugares: conserva los componentes visuales existentes; la sugerencia seleccionada ahora se enfoca directamente y la confirmación permanece anclada a su marcador.
- Marcador final del itinerario: sustituye únicamente el último endpoint numerado por un banderín SVG de 18 × 18 px, usando la paleta de iconos del sistema (`#11c7dc`, `#14394b`, `#fff3d6`).
- Landmarks editoriales del itinerario permanecen únicamente en la vista `segments` mediante una sola `WebGLOverlayView` y no forman parte del DOM/CSS de la timeline.

## Rendimiento e integridad

- El rediseño no añade llamadas a Google, Geoapify, Places, Routes ni Geocoding.
- Banderas e iconos son assets ya existentes/locales; no crean dependencias externas nuevas.
- `nightCount` es derivado en memoria; no crea campos Firestore, mutaciones ni writes adicionales por sí mismo.
- La navegación lateral reutiliza `activeTab`, `setCurrency`, saved trips e idioma existentes.
- El drag & drop reutiliza `reorderSegment`; la continuidad se corrige en el dominio antes de que autosave/v4 planifique mutaciones.
- No se modifica `useAppInteractions.js`.
- No se modifica Storage v4, IndexedDB, Sync Coordinator, Gate G, Rules, Functions, provider caches ni App Check.

## Validación requerida

- `npm test`
- `npm run test:rules`
- `npm run test:rules:phase-k-e2e`
- `npm run lint`
- `npm run build`
- Revisión de escritorio y móvil antes de integrar.
- Smoke visual/funcional en preprod después del deploy.
