# Contrato de preservación visual

Visual delta: requested
Requested visual scope: selectores de moneda/idioma del header global; contenido y validación de cada trayecto; navegación primaria dentro del header; panel flotante sobre el mapa; eliminación del eje vertical y uso de divisores punteados con picos Atlas; unificación de ciudad origen con destinos; vista fija y compacta de siete ciudades contando origen; ocultamiento visual del scrollbar; filas de 48 px sin reducir bandera ni ancho de ciudad; etiquetas Noches/Costo estandarizadas a 56 px exactos sin estiramiento; conservación de nota y eliminar; sustitución del chevron de desplegar por una franja azul lateral con `>` en cada fila; y traslado del formulario de fechas/gastos desde expansión inline a una superficie flotante sobre el mapa que reutiliza el lenguaje visual de `.segnote`, solicitado explícitamente por el product owner.

La interfaz puede incorporar capacidades nuevas, pero el lenguaje visual de Atlas debe permanecer intacto. Los controles añadidos reutilizan componentes, dimensiones, espaciados, iconografía, dominio y persistencia ya existentes. Los cambios enumerados abajo son los deltas visuales aprobados.

## Invariantes

- No cambiar paleta, tipografías, tamaños, radios, sombras ni espaciados existentes fuera del alcance solicitado explícitamente.
- No mover, ocultar, eliminar ni redimensionar controles actuales salvo los cambios solicitados.
- No cambiar la jerarquía visual ni el comportamiento responsive fuera de las reglas adaptativas descritas aquí.
- No renombrar clases sin conservar reglas y especificidad equivalentes.
- Los nuevos controles deben reutilizar componentes, dimensiones y estados visuales existentes.
- Las reglas de accesibilidad no deben producir cambios visibles salvo foco de teclado cuando corresponda.
- Cualquier modularización CSS debe conservar el orden efectivo de las reglas y el resultado de la cascada.
- Ningún cambio visual crea una ruta paralela de dominio, autosave, Storage v4, Rules, Functions o proveedores.

## Header global y navegación

- El header global mantiene 63 px de altura y concentra marca, `Itinerario / Mis Rutas / Notas`, métricas y acciones.
- `Itinerario`, `Mis Rutas` y `Notas` reutilizan `activeTab`; sus iconos lineales usan `var(--atlas-accent)` (`#19a5d0`). `Mis Rutas` no muestra contador; `Notas` conserva el contador coral.
- Hover, apertura y selección de la navegación no pintan fondos ni sombras. La opción seleccionada cambia sólo el texto a gris fuerte `#5f6875`; el foco de teclado conserva outline visible.
- Un separador vertical explícito separa `Notas` de `Total del viaje`.
- Las tarjetas-resumen del header conservan valor/selectores a 14 px y etiqueta secundaria a 11 px. `Destinos/Ciudades` usa rojo; `Distancia total` mantiene su indicador `|---|`.
- Los selectores de moneda e idioma usan el dropdown Atlas controlado y portalizado; no dependen del selector nativo ni añaden peticiones de red.
- `Total del viaje` vive en el header y abre el desglose canónico de `useAppEditorState`; no existe footer `Total del trayecto` dentro de cada trayecto.
- La distancia se deriva localmente de coordenadas canónicas; no genera llamadas nuevas a proveedores.
- El header global no forma parte de la antigua prueba de densidad equivalente a navegador al 90% y no se miniaturiza por cambios del itinerario.

## Panel flotante del itinerario

- En escritorio el mapa ocupa el 100% del workspace y el módulo de itinerario se superpone como tarjeta blanca flotante con radio de 12 px y sombra ligera.
- El ancho sigue siendo `--workspace-panel-width`; el campo ciudad conserva exactamente su ancho canónico de 106 px y las banderas conservan 30 × 20 px. Estos tamaños no se reducen para hacer caber más filas.
- La antigua densidad artificial equivalente al navegador al 90% queda retirada: no se escalan ni comprimen tipografías, banderas, iconos, inputs o controles para simular zoom.
- El card se centra verticalmente en el área útil situada debajo del header fijo.
- La vista objetivo contiene siete ciudades contando la ciudad origen. El scrollbar del editor permanece oculto visualmente; el overflow funcional sólo queda como salvaguarda para datos heredados o contenido excepcional.
- La ciudad origen no es un bloque visual especial: usa la misma altura, tipografía, bandera, guía de ciudad, métricas y acciones que cualquier destino. La única diferencia geométrica permitida es ocupar con padding el espacio del drag handle que el origen no necesita.
- Origen y destinos usan una banda exacta de 48 px. La primera fila aprovecha el aire superior y la última el inferior sin márgenes/paddings asimétricos; todos los elementos quedan centrados verticalmente entre divisores.
- Drag handle, bandera, ciudad, fecha, Noches, Costo, nota, eliminar y pestaña lateral usan una única retícula y distancias uniformes.
- `Noches` y `Costo` son cajas estandarizadas de exactamente 56 px de ancho y 22 px de alto. No pueden crecer, encogerse ni heredar el antiguo `min-width: 58px`. `Noches` conserva fondo `#F1F1F1` y texto `#535353`; `Costo` conserva `var(--atlas-accent)` con texto blanco.
- El botón de nota y el botón eliminar permanecen visibles en cada trayecto. En origen, el botón X sigue limpiando únicamente la ciudad seleccionada y no borra silenciosamente fechas, gastos o nota.

## Divisores y pestaña de detalle

- El eje punteado vertical entre países permanece eliminado.
- Cada límite entre origen/trayecto y entre trayectos usa una línea horizontal de 1 px con el patrón histórico `#c9ced7` durante 3 px y 4 px transparentes.
- Los extremos conservan los picos sólidos Atlas `#19a5d0` aprobados; el card sigue siendo una superficie blanca continua, sin `clip-path` ni reconstrucciones transparentes.
- El antiguo chevron de desplegar/contraer se elimina por completo de origen y destinos.
- En su lugar, cada fila incorpora en el borde derecho una franja vertical Atlas `var(--atlas-accent)` de 18 px de ancho por la altura completa de la fila, con `>` blanco centrado.
- La franja es el único disparador para abrir los datos detallados del trayecto; no altera el ancho de bandera ni ciudad y ocupa su propio track al final de la retícula.

## Formulario de fechas y gastos en modal

- El formulario deja de expandirse inline dentro de la lista. `SegmentForm` y la fila de origen no montan `SegmentBody`/`OriginBody` debajo de la fila ni usan chevron/`aria-expanded` para este flujo.
- Al pulsar la franja azul, se abre sobre el mapa una superficie `segnote segment-details-modal`, reutilizando radio, sombra, cabecera, cierre y posición del modal de notas.
- Sólo puede estar activa una superficie contextual entre nota y detalles; abrir una cierra la otra. Pulsar fuera o cerrar la cabecera descarta la superficie sin alterar datos.
- El modal de un destino reutiliza el `SegmentBody` canónico y sus callbacks existentes `updateSegment`/`updateExpenses`.
- El modal del origen reutiliza `OriginBody`, `updateOriginDetails` y `updateOriginExpenses`; no crea un segmento artificial ni una ruta de persistencia distinta.
- El contenido detallado conserva la rejilla de dos columnas. Las fechas siguen alineadas con los conceptos y los seis conceptos fijos se muestran en el orden `Hospedaje / Avión`, `Tren / Bus`, `Taxi / Atracciones`.
- La fecha única del origen ocupa la primera celda de la misma rejilla hipotética de dos fechas, de modo que la segunda columna de conceptos mantiene la misma guía que los destinos.
- El calendario de inicio usa fecha fin como máximo y el de fin usa fecha inicio como mínimo; `SegmentBody` sigue bloqueando `startDate > endDate` también ante cambios programáticos.
- Los triggers de fecha conservan exactamente la misma altura, padding, fondo y posición de texto en reposo, hover, focus y estado abierto.
- Las etiquetas de conceptos conservan 13 px; SVG 15 px; caja horizontal del icono 18 px; importes 12 px; prefijo monetario 11 px; `Otros gastos` 13 px. El modal no vuelve a aplicar la vieja miniaturización de `FloatingEditorPolish.css` al contenido.
- Los campos de cantidad siguen filtrando caracteres inválidos, limitan a dos decimales, presentan separador de miles y envían `number` canónico al dominio.
- `Tren` usa rojo, `Avión` morado y `Taxi` rosa; el campo persistido continúa siendo `taxiUber`.
- `Otros gastos` sigue modificando `expenses.others` y conserva la misma rejilla; los viajes heredados con alimentos mantienen su fila de compatibilidad sin costo oculto.

## Notas, origen y acciones existentes

- Los botones de nota de origen y trayectos siguen abriendo la misma superficie `.segnote` sobre el mapa, con textarea, contador, estado de persistencia y cierre.
- La nota del origen continúa en `originDetails.note`, limitada a 500 caracteres y validada por Rules v3/v4 como campo opcional.
- Los gastos del origen continúan participando en el `Total del viaje` y su desglose, sin total independiente al pie del origen.
- La edición del modal de detalles usa exactamente el mismo autosave/sync incremental que la edición inline anterior; mover la presentación no cambia el contrato persistido.
- La lista compacta ya no ejecuta `scrollIntoView`, no reserva `scroll-margin` y no reposiciona el panel al abrir datos.

## Resto del mapa y aplicación

- `AppWorkspaceMenu` conserva su anclaje flotante y el colapso completo del módulo izquierdo sigue liberando el mapa.
- Los overlays de nota, detalles y búsqueda permanecen por debajo del header fijo y a la derecha del panel cuando corresponde.
- El selector `KM / MI` reutiliza `topmenu`, `topitem`, `dropdown` y `dropdown__opt`.
- La instalación PWA sólo aparece cuando el navegador emite `beforeinstallprompt`.
- La búsqueda de lugares conserva sus componentes y proveedores actuales; seleccionar una sugerencia enfoca su resultado y la confirmación permanece anclada al marcador.
- El marcador final mantiene el banderín SVG de 18 × 18 px y los puntos intermedios mantienen núcleo visual de 7 × 7 px más borde fino.
- Los landmarks editoriales siguen visibles únicamente en vista `segments` mediante una sola `WebGLOverlayView`, con la colección curada y el handoff gradual a landmarks nativos de Google ya definidos.
- Los assets de landmarks siguen siendo locales y no reutilizan assets internos de Google Maps.

## Rendimiento y arquitectura

- El header reutiliza cálculos existentes (`total`, `breakdown`, checklist) y no introduce solicitudes nuevas.
- La distancia permanece como cálculo local lineal sobre los trayectos.
- El formulario de gastos reutiliza `segment.expenses`/`originDetails.expenses`; moverlo al modal no añade writers, timers, colecciones, mutaciones o provider requests.
- Sólo se monta el formulario detallado del target activo; las otras seis filas permanecen compactas y no mantienen editores de gastos ocultos en el DOM.
- El límite visual de siete ciudades es presentación únicamente: no recorta, reordena ni transforma `trip.segments` y no introduce paginación, virtualización ni un segundo estado de dominio.
- La sanitización de importes, validación de fechas y formato siguen siendo funciones locales deterministas.
- La proyección enviada al mapa contiene únicamente los campos que afectan representación; editar fechas o costos no debe recrear rutas/marcadores si la proyección cartográfica no cambia.
- Storage v4, Firestore Rules, Functions, App Check, migraciones, providers y autosave conservan exactamente sus rutas actuales.
- Se mantiene un único `AdvancedMarkerElement` por ciudad y una sola `WebGLOverlayView` para landmarks; no se agregan nodos/markers por esta modificación.

## Configuración de Google Maps

- El `Map ID` debe usar rendering vectorial para que `WebGLOverlayView` comparta el contexto del basemap.
- El Cloud-based Map Style puede mantener `Landmarks → Illustrated`; los POI ilustrados de Google aparecen según zoom y disponibilidad.
- La capa Atlas no descarga, copia ni reutiliza assets internos de Google Maps.

## Validación requerida

- `npm run test:impact`
- `npm run test:contracts`
- `npm test`
- `npm run lint`
- `npm run build`
