# Contrato de preservación visual

Visual delta: requested
Requested visual scope: selectores de moneda/idioma del header global y contenido expandido de cada trayecto, incluyendo validación de fechas, alineación de conceptos, rejilla de dos conceptos por línea y editor de gastos sin cajas visibles, solicitado explícitamente por el product owner

La interfaz puede incorporar capacidades nuevas, pero el lenguaje visual de Atlas debe permanecer intacto. Los controles añadidos reutilizan componentes, dimensiones, espaciados, iconografía y estados ya existentes. Los cambios visuales enumerados abajo fueron solicitados y aprobados explícitamente para el mapa y el editor del itinerario.

## Invariantes

- No cambiar paleta, tipografías, tamaños, radios, sombras ni espaciados existentes fuera de cambios visuales solicitados explícitamente.
- No mover, ocultar, eliminar ni redimensionar controles actuales salvo cambios visuales solicitados explícitamente.
- No cambiar la jerarquía visual ni el comportamiento responsive existente fuera de las reglas adaptativas descritas abajo.
- No renombrar clases sin conservar reglas y especificidad equivalentes.
- Los nuevos controles deben reutilizar componentes, dimensiones y estados visuales existentes.
- Las reglas de accesibilidad no deben producir cambios visibles salvo foco de teclado cuando corresponda.
- Cualquier modularización CSS debe conservar el orden efectivo de las reglas y el resultado de la cascada.

## Controles incorporados

- Header global del viaje: el nombre sale del módulo `Itinerario` y pasa a una franja persistente sobre todo el workspace. Sigue siendo un campo editable directo, sin icono de lápiz, y conserva 20 px como tamaño principal.
- Identidad del viaje: debajo del nombre, dentro del mismo bloque del header, se muestra el rango global de fechas y el selector de moneda. Moneda es una preferencia del viaje y deja de vivir en el menú `Workspace`.
- Métricas del header: en la misma fila del título se muestran `Destinos`, `Noches totales`, `Total del viaje` y `Distancia total`, cada una con icono y jerarquía compacta. El layout se comprime de forma progresiva y mantiene desplazamiento horizontal interno de métricas cuando el ancho no permite conservar todas las etiquetas completas.
- Selectores de moneda e idioma: dejan de depender del desplegable nativo del sistema operativo y comparten un dropdown Atlas controlado, con el mismo radio, sombra, estados hover/focus, código, nombre localizado y marca de selección. El menú se renderiza por portal para no quedar recortado por el overflow responsive del header; no cambia la semántica de persistencia de moneda ni de preferencia global de idioma.
- Total del viaje: deja de existir como bloque al final de los trayectos. Su valor vive en el header y, al pulsarlo, abre el mismo desglose por concepto, monto y porcentaje usando el `total` y `breakdown` canónicos de `useAppEditorState`.
- Distancia total: se deriva localmente de las coordenadas canónicas de origen/destino mediante distancia geodésica; no genera llamadas nuevas a Google, Geoapify ni otros proveedores.
- Idioma: sale del menú `Workspace` porque es una preferencia global de aplicación/usuario y pasa al menú global de cuenta. No se mezcla con preferencias específicas de un viaje.
- Editor del itinerario: el espacio que antes ocupaba nombre/Guardar queda dedicado exclusivamente a trayectos y su contenido. `Guardar` vive al final de las métricas del header global.
- Alineación responsive del itinerario: en escritorio la columna de ciudad absorbe el ancho disponible, mientras fechas, noches, costo y acciones conservan su geometría compacta. La última acción de cada trayecto y el contenido principal comparten la misma guía derecha, evitando espacio blanco sobrante en pantallas amplias.
- Formulario expandido del trayecto: las fechas pasan a dos campos paralelos compactos sin etiqueta intermedia; los seis conceptos fijos de gasto se muestran en una rejilla de dos columnas, en este orden: `Hospedaje / Avión`, `Tren / Bus`, `Taxi / Uber / Atracciones`. `Atracciones` forma parte del mismo grupo fijo para compartir exactamente la misma geometría y separación que los otros conceptos.
- Validación de fechas del trayecto: el calendario de inicio usa la fecha fin como máximo y el calendario de fin usa la fecha inicio como mínimo. Además, `SegmentBody` valida el parche antes de enviarlo al modelo, de modo que la UI no puede dejar `startDate > endDate` aunque el control se invoque programáticamente.
- Pulido visual de conceptos y montos: las etiquetas de concepto aumentan 3 px respecto del tamaño efectivo anterior y los SVG aumentan 2 px; `Otros gastos` comparte exactamente la misma jerarquía tipográfica/iconográfica. La primera columna de conceptos se alinea con el inicio visible del nombre de ciudad usando la geometría real del timeline; `Atracciones` y `Otros gastos` dejan de tener distanciamientos propios. Los triggers de fecha y los campos de cantidad no dibujan borde, fondo ni anillo de foco, y las filas no añaden sombreado gris al hover. Los importes se muestran en negro y el símbolo monetario permanece próximo a la cifra sin alterar el valor persistido.
- Otros gastos del trayecto: el botón `+ Otros gastos` vive al final del bloque. Cada clic conserva el mismo modelo canónico de `expenses.others`; las filas creadas se acomodan en la misma rejilla de dos columnas, dos gastos por línea, y el botón permanece alineado a la misma guía izquierda de los conceptos fijos.
- Compatibilidad de gastos existentes: el selector `Gasto único / Por comida` deja de formar parte de la UI nueva. Si un viaje existente conserva un monto de alimentos, se muestra una única fila de compatibilidad para que nunca exista un costo oculto; al editarla se normaliza al modo simple sin alterar el contrato persistido.
- Etiquetas de métricas de trayecto: `Noches` conserva texto `#535353` sobre fondo `#F1F1F1`; `Costo` conserva fondo `var(--atlas-accent)` con texto `#FFFFFF`. Ambas mantienen el borde suave incorporado como refinamiento visual.
- Barra lateral del editor: se elimina el borde derecho y su sombra divisoria; la separación entre opciones internas se conserva.
- Ciudad origen: en escritorio el campo se acorta para terminar aproximadamente en la misma guía vertical que el final de la primera fecha `dd/mm` de los trayectos.
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

- El header reutiliza cálculos ya disponibles (`total` y `breakdown`) y memoriza el resumen derivado del viaje; no crea solicitudes de red nuevas.
- Los nombres de moneda e idioma se generan localmente con `Intl.DisplayNames`; abrir los dropdowns no realiza solicitudes de red.
- La distancia se calcula en memoria sobre los trayectos existentes y su complejidad es lineal respecto al número de trayectos.
- El formulario de gastos reutiliza el objeto `segment.expenses`; reordenar la presentación, agrupar conceptos en dos columnas, alinear sus controles o agregar una fila de `others` no introduce llamadas de red, provider requests ni escrituras fuera del autosave/sync incremental ya existente.
- La validación de rango de fechas es local y determinista; no agrega persistencia, migraciones ni llamadas a servicios.
- `Atracciones` se presenta como un monto agregado sin cambiar su representación canónica como lista: el helper de dominio ajusta el total preservando IDs/etiquetas existentes y, por tanto, no requiere cambios de Rules, Storage v4, migraciones ni Functions.
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

- `npm run test:impact`
- `npm run test:contracts`
- `npm test`
- `npm run lint`
- `npm run build`
- Revisión de escritorio y móvil antes de integrar.
- Comparación visual de las pantallas principales cuando el entorno de despliegue esté disponible.
