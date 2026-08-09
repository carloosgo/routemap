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
- Los landmarks personalizados de ciudades se eliminan del código y de los assets. El mapa deja de añadir ilustraciones propias junto a cada ciudad.
- Los monumentos y lugares prominentes se delegan al sistema nativo de Google Maps mediante `Illustrated landmark style` en el Cloud-based Map Style asociado al Map ID. La disponibilidad de una ilustración depende de que Google tenga un illustrated icon asociado a ese POI.

## Rendimiento

- Se mantiene un único `AdvancedMarkerElement` por ciudad para la capa propia de Atlas.
- No se añaden imágenes, pseudo-elementos, listeners ni markers adicionales para landmarks.
- No se añaden solicitudes a Places, Routes, Geocoding ni otros proveedores para mostrar monumentos ilustrados.
- Los Illustrated Landmarks forman parte del basemap y del estilo de Google Maps; Atlas no mantiene un catálogo mundial de monumentos.

## Configuración de Google Maps

- El `Map ID` debe tener asociado un Cloud-based Map Style publicado.
- En el editor del estilo, `Landmarks` debe configurarse con `Illustrated landmark style` para que Google muestre sus illustrated POI icons cuando estén disponibles.
- Esta configuración pertenece al estilo administrado en Google Cloud y no requiere lógica adicional en `GooglePlacesMap.jsx`.

## Validación requerida

- `npm test`
- `npm run lint`
- `npm run build`
- Revisión de escritorio y móvil antes de integrar.
- Comparación visual de las pantallas principales cuando el entorno de despliegue esté disponible.
