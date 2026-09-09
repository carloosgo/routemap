# Contrato de preservación visual

Visual delta: requested
Requested visual scope: selectores de moneda/idioma del header global; contenido y validación de cada trayecto; navegación primaria dentro del header; retorno de Itinerario/Mis Rutas/Notas a un panel integrado y fijo a la izquierda, usando exactamente `--workspace-panel-width` para alinear su borde derecho con el separador entre `Notas` y `Fechas del viaje`; eliminación del eje vertical y uso de divisores punteados sin picos laterales; unificación de ciudad origen con destinos; vista compacta con scrollbar visible; filas de 40 px sin reducir bandera; eliminación del país y de la fecha en el resumen de fila; campo ciudad de 126 px; Costo como único dato textualual del resumen antes de Nota / Desplegar / Cerrar; Costo de cada trayecto en `#5F5F5F` y peso bold; desplazamiento visual de 2 px hacia la izquierda del importe de cada trayecto sin mover su track ni las acciones; espaciado visual uniforme de 8 px entre Costo, Nota, Desplegar y Cerrar usando el ancho real de iconos de 14 px; autoridad final de `ItineraryCompactTen.css` para impedir que geometrías legacy de Fecha/Noches/acciones vuelvan a pisar la retícula compacta; reducción del inset lateral del itinerario; divisores limitados desde el inicio de la bandera hasta el final visual del tache de cerrar; conservación del anclaje viewport del botón global de tres puntos; ocultación temporal de la pestaña de colapso mientras está abierto el modal de detalles; mantenimiento del formulario de fechas/gastos en una superficie flotante sobre el mapa al estilo `.segnote`; aprovechamiento completo y simétrico del ancho del modal de detalles, con dos mitades iguales, fechas extendidas al ancho de cada mitad y etiquetas largas sin truncamiento innecesario; reducción del indicador visual de nota con contenido sin alterar su área clicable; sustitución de la distancia del header por el rango global de fechas del viaje inmediatamente después de `Notas`; eliminación de la sombra de la cabecera y traslado de la profundidad visual al borde derecho del panel integrado hacia el mapa; separación vertical adicional de 12 px para Nota y Detalles respecto al header; elevación de la pestaña de colapso por encima de la sombra lateral del panel; separador inferior continuo de 1 px a todo el ancho del header; centrado adaptativo de icono/concepto/importe respecto a cada campo de fecha; separación de 8 px entre el header y los desplegables de Total del viaje, Moneda e Idioma; número y bandera de cada destino en tracks independientes con un ritmo único de 10 px entre borde / arrastre / número / bandera / ciudad; track de costo compacto de 90 px; todos los iconos visibles del header desde Itinerario hasta Idioma, incluidos los chevrons de Total del viaje, Moneda e Idioma, en `#667085`; Total del viaje sin fondo de hover; opciones Moneda/Idioma con formato `código | nombre` y separadores tenues; conceptos `Vuelo/Flight` y `Otro/Other`; filas dinámicas de gastos alineadas con la misma retícula y ritmo vertical de los conceptos fijos; viewport del mapa bajo control del usuario después de la primera proyección; actualización incremental de rutas y marcadores sin frame vacío al agregar, eliminar o reordenar ciudades; rutas del mapa como línea punteada limpia sin flechas ni chevrons de dirección; y conservación del resto de la arquitectura, solicitado explícitamente por el product owner.

La interfaz puede incorporar capacidades nuevas, pero el lenguaje visual de Atlas debe permanecer intacto. Los controles añadidos reutilizan componentes, dimensiones, espaciados, iconografía, dominio y persistencia ya existentes. Los cambios enumerados abajo son los deltas visuales aprobados.

## Ajuste solicitado: cierre day-first del header y línea temporal de lugares (PR #90)

- Este apartado es autoritativo para el cierre visual de PR #90 y sustituye únicamente las reglas históricas incompatibles de `Mis Rutas` descritas más abajo.
- El editor global de `Fechas del viaje` mantiene los dos `CalendarDateInput` existentes y debe permitir que el calendario desplegable sea completamente visible. La excepción de overflow se limita al diálogo de fechas; el desglose de `Total del viaje` conserva su clipping actual.
- En cada día, `DÍA N` permanece en mayúsculas y la fecha usa gris fuerte como información secundaria. No se añade una segunda guía en la cabecera; el estado vacío conserva únicamente la guía inferior y no usa cursivas.
- Los formularios de gastos de cada ciudad ya no duplican selección de fechas: la edición temporal pertenece al header global y el módulo de detalles conserva sólo los conceptos de costo solicitados.
- El control de arrastre corresponde al día completo, no a la ciudad. Mover un día desplaza conjuntamente su ciudad y sus lugares y actualiza la posición temporal resultante mediante el modelo canónico existente.
- La ciudad mostrada dentro de la cabecera del día no expone eliminación manual. Tanto una ciudad agregada explícitamente como una ciudad inferida al guardar primero un lugar muestran bandera y `Ciudad, País` en la misma posición.
- Los lugares continúan pudiendo moverse entre cualquier día del viaje aunque el destino temporal pertenezca a otra ciudad o país; esa libertad no cambia su pertenencia geográfica canónica por sí sola.
- La línea punteada vertical de `Mis Rutas` conecta exclusivamente los puntos de lugares consecutivos de un mismo día con el color de ese día. Comienza en el centro del primer nodo, atraviesa la altura real de las tarjetas de conexión/transporte y termina en el centro del último nodo; no sobresale por encima del primero ni por debajo del último.
- Esta línea pertenece exclusivamente al listado de `Mis Rutas`. No modifica polylines, marcadores, cámara, renderer ni ningún comportamiento del mapa de Google.
- No se crean entidades de día en Storage v4 ni rutas paralelas de persistencia. Autosave, Firestore Rules, Functions, proveedores, conexiones, gastos, notas y mapa mantienen sus contratos canónicos salvo los campos temporales ya aprobados por la implementación day-first.

## Ajuste solicitado: búsqueda unificada, ciudades sin pivote de origen y ancho exacto de Mis Rutas (PR #84)

- Este apartado es autoritativo para la superficie activa de `Mis Rutas` y sustituye únicamente las reglas históricas incompatibles de este documento. No reabre ni rediseña el resto de Atlas.
- La navegación activa permanece reducida a `Mis Rutas / Notas`; no reaparece una pestaña separada de `Itinerario` ni una segunda superficie de edición.
- En el flujo activo no existe una fila visual especial de ciudad origen. La lista de ciudades se proyecta desde `trip.segments`; la primera ciudad es simplemente la primera ciudad del viaje. `trip.origin` se conserva sólo como compatibilidad del modelo Storage v4 existente y no se convierte en un nuevo esquema ni se elimina mediante esta PR.
- El buscador general del mapa comparte una sola superficie visible para dos dominios de resultados: ciudades provenientes de Geoapify y establecimientos/lugares provenientes de Google. Los resultados se distinguen explícitamente por tipo y conservan clientes, cuotas, reglas y políticas de datos independientes.
- Geoapify conserva mínimo de 3 caracteres y debounce de 450 ms; Google conserva mínimo de 4 caracteres y debounce de 1000 ms. Compartir el campo visible no autoriza a reducir, aumentar ni homogeneizar esas políticas.
- El antiguo catálogo persistido de ciudades Atlas deja de participar en la búsqueda activa. La búsqueda de ciudades consulta Geoapify Geocoding Search y puede usar únicamente cachés técnicas descartables de proveedor/navegador; esas cachés no son fuente canónica del viaje.
- Seleccionar una ciudad permite agregarla al viaje mediante los callbacks canónicos de segmentos. Guardar un establecimiento Google lo asigna a una ciudad ya existente cuando la coincidencia es segura; si esa ciudad aún no existe, se resuelve mediante Geoapify y se crea mediante el flujo canónico antes de asociar el lugar. No se crea una ruta paralela de persistencia.
- Si un lugar pertenece a una ciudad que todavía no tiene fechas, el lugar permanece asociado y pendiente de asignación diaria. El número de día se deriva después del calendario global del viaje; nunca se inventa un día local por ciudad.
- Las ciudades conservan reordenamiento mediante drag con `pointermove / pointerup / pointercancel`; `pointercancel` no confirma un reorder y sólo el puntero activo puede cerrarlo. El cambio de superficie no degrada esa interacción a botones de subir/bajar.
- El mapa unificado mantiene `Ciudades` y `Rutas` como capas de visibilidad independientes sobre el mismo renderer. No se crea un segundo mapa, un renderer alternativo ni duplicación de llamadas a proveedores.
- El separador del header entre `Notas` y `Fechas del viaje` conserva su posición propia mediante `--workspace-header-split-width`; deja de depender de `--workspace-panel-width` para evitar un ciclo geométrico.
- En escritorio, el borde derecho real de `Mis Rutas` termina exactamente en el punto medio entre el separador `Notas / Fechas del viaje` y el borde izquierdo real del icono de `Fechas del viaje`. La posición se calcula a partir de la geometría renderizada del header; no se aproxima con un offset fijo en píxeles.
- `--workspace-panel-width` gobierna el ancho real del panel/workspace después de esa medición. Las reglas históricas que exigían que el panel terminara exactamente en el separador del header quedan sustituidas sólo para esta superficie activa.
- El buscador sigue centrado dentro de `.mappane`, pero su ancho máximo se reduce proporcionalmente al ancho útil de mapa perdido por el ensanchamiento de `Mis Rutas`; mantiene 550 px como máximo histórico y no introduce escala, zoom ni compresión tipográfica.
- El cambio de ancho no altera alturas de 40 px, tipografías, iconografía, paleta, radios, sombras, comportamiento responsive ni espaciados fuera del alcance descrito.
- Storage v4, Firestore Rules, autosave, App Check, conexiones, gastos, notas y documentos históricos conservan sus contratos. Ningún payload dinámico de Google o Geoapify se vuelve dato canónico por este ajuste.

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
- La superficie principal del header queda plana, con `box-shadow: none`. La separación inferior se dibuja mediante `.trip-summary::after` como una línea continua de 1 px y color `#eef0f2` desde `left: 0` hasta `right: 0`, garantizando que el divisor cubra todo el ancho del header y no sólo una de sus columnas; la profundidad con el mapa se expresa únicamente desde el panel integrado izquierdo.
- `Itinerario`, `Mis Rutas` y `Notas` reutilizan `activeTab`; sus iconos lineales usan `#667085`. `Mis Rutas` no muestra contador; `Notas` conserva el contador coral.
- Hover, apertura y selección de la navegación no pintan fondos ni sombras. La opción seleccionada cambia sólo el texto a gris fuerte `#5f6875`; el foco de teclado conserva outline visible.
- Un separador vertical explícito separa `Notas` de `Fechas del viaje`; el rango global es la primera información del bloque de métricas.
- Las dos primeras columnas del header (`Atlas` + navegación primaria) suman exactamente `--workspace-panel-width`; esa misma variable gobierna el panel integrado, por lo que su borde derecho coincide con el separador anterior sin offsets duplicados ni aproximaciones en píxeles.
- Las tarjetas-resumen del header conservan valor/selectores a 14 px y etiqueta secundaria a 11 px. Los iconos de Fechas del viaje, Total del viaje, Destinos/Ciudades, Noches, Moneda e Idioma usan el mismo `#667085`; también lo usan los chevrons visibles de Total del viaje, Moneda e Idioma. Los colores de textos, badges y del contenido interno del desglose no cambian por esta regla.
- `Fechas del viaje` muestra la fecha inicial y final globales derivadas de `tripSummary.startDate/endDate`; cuando no existen fechas muestra el estado traducido `Sin fechas / No dates`.
- La información de kilómetros/distancia deja de renderizarse en el header. No se agrega una métrica equivalente en otra posición.
- Los selectores de moneda e idioma usan el dropdown Atlas controlado y portalizado; no dependen del selector nativo ni añaden peticiones de red. Sus menús toman como referencia el borde inferior real de `.trip-summary` y comienzan 8 px por debajo de él, no desde el borde inferior del trigger.
- Cada opción de Moneda/Idioma se presenta como `CÓDIGO | Nombre` (por ejemplo `EUR | Euro`, `EN | Inglés`) y las filas se separan mediante una línea tenue de 1 px, sin alterar el color propio del estado seleccionado.
- `Total del viaje` vive en el header y abre el desglose canónico de `useAppEditorState`; no existe footer `Total del trayecto` dentro de cada trayecto. El desglose también deja una separación visual equivalente bajo la cabecera antes de iniciar su superficie flotante.
- `Total del viaje` no pinta fondo ni cambia de color al pasar el mouse o permanecer abierto; su interacción se comunica por el chevron y la superficie de desglose.
- El header global no forma parte de la antigua prueba de densidad equivalente al navegador al 90% y no se miniaturiza por cambios del itinerario.

## Panel integrado compartido

- En escritorio `Itinerario`, `Mis Rutas` y `Notas` vuelven a vivir en una columna integrada fija a la izquierda; el mapa ocupa únicamente la columna restante y deja de dibujarse por debajo del panel.
- El workspace usa `grid-template-columns: var(--workspace-panel-width) minmax(0, 1fr)`. No existe una segunda medida para el panel: la guía vertical del header y la del workspace son la misma.
- El panel integrado ocupa el 100% de la altura del workspace, sin esquinas flotantes ni separación lateral. Su única sombra exterior es direccional hacia la derecha, sobre el borde que mira al mapa (`8px 0 18px -14px rgba(15, 23, 42, 0.34)`); no se agrega sombra al resto de sus lados. El contenido visible comienza bajo los 63 px contractuales del header.
- El cambio es exclusivamente de geometría exterior. Las banderas conservan 30 × 20 px; el campo ciudad conserva 126 px; las filas conservan 40 px; Costo usa 90 px; Nota / Desplegar / Cerrar conservan iconos visuales de 14 px y sus separaciones aprobadas.
- No se aplica `transform: scale`, `zoom`, reducción tipográfica, compresión de iconos ni ninguna técnica para hacer que los trayectos “quepan”. Deben renderizarse a su tamaño natural para conservar nitidez y calidad.
- La antigua densidad artificial equivalente al navegador al 90% queda retirada: no se escalan ni comprimen tipografías, banderas, iconos, inputs o controles para simular zoom.
- La lista mantiene un scrollbar visible (`scrollbar-width: thin` / 7 px en WebKit) y `scrollbar-gutter: stable`; no se usa `scrollIntoView` ni se reposiciona el panel al abrir detalles.
- `editor__body` usa 0 px arriba, 8 px a la derecha, 6 px abajo y 10 px a la izquierda. La banda de origen y cada destino usa 40 px sin cambiar el tamaño interno de bandera, ciudad o acciones.
- La ciudad origen no es un bloque visual especial: usa la misma altura, tipografía, bandera, guía de ciudad, costo y acciones que cualquier destino. Como no tiene drag ni número, reserva esa huella mediante padding para que su bandera y ciudad coincidan con las guías de los destinos.
- Origen y destinos usan una banda exacta de 40 px. Todos los elementos quedan centrados verticalmente entre divisores.
- El país deja de mostrarse en la fila; sólo aparece el nombre de la ciudad. El nombre seleccionado usa 13 px / 600, una sola línea y no utiliza `translateY`, para evitar suavizado subpíxel innecesario.
- La fecha y el número de noches no aparecen en el resumen compacto. Después de la ciudad, la retícula visible contiene únicamente `Costo / Nota / Desplegar / Cerrar`.
- `ItineraryCompactTen.css` es la autoridad final de esta retícula y se carga después de `ItineraryTripHeader.css` y `FloatingItineraryPanel.css`; las reglas legacy no pueden redefinir columnas de Fecha/Noches ni volver a reservar 22 px por acción.
- En cada destino, arrastre, número, bandera y ciudad son tracks independientes: drag visual de 14 px, número de 19 px, bandera de 30 px y ciudad de 126 px. El borde izquierdo del contenido y cada transición `arrastre → número → bandera → ciudad` usan exactamente `--itinerary-compact-gap: 10px`. El drag conserva un área de captura transparente ampliada y no sacrifica usabilidad por usar su ancho visual real.
- El origen reserva 53 px antes de la bandera (`14 + 10 + 19 + 10`) para que la bandera y la ciudad permanezcan exactamente alineadas con los destinos aunque no muestre drag ni número.
- El bloque `Costo / Nota / Desplegar / Cerrar` usa `width: max-content`, alineación al extremo derecho y una retícula de `90px repeat(3, 14px)`. Los tres iconos usan su ancho visual real de 14 px; no se reservan columnas artificiales de 22 px.
- El espacio visible entre el borde derecho de `Costo` y `Nota`, entre `Nota` y `Desplegar`, y entre `Desplegar` y `Cerrar` es exactamente 8 px. El conjunto conserva 4 px de padding derecho para mantener el X en la posición visual aprobada.
- Los botones icon-only pueden extender su área clicable mediante una capa transparente absoluta, pero esa capa no participa en el ancho de la retícula ni altera las distancias visuales.
- `Costo` se muestra como texto plano de 12 px / 700 y color exacto `#5F5F5F`, alineado a la derecha dentro de un track de 90 px y con `padding-right: 2px` para desplazar únicamente el importe 2 px hacia la ciudad sin mover el track ni las acciones. No utiliza pill, fondo ni borde.
- El botón de nota, el botón de desplegar y el botón eliminar/cerrar conservan el aspecto icon-only. En origen, el botón X sigue limpiando únicamente la ciudad seleccionada y no borra silenciosamente fechas, gastos o nota.
- Note marker geometry is 5px with top 3px and left -1px; sólo cambia el punto visual cuando una nota contiene información y permanece intacta la caja clicable del botón de nota.
- Al colapsar el panel, la primera columna pasa a 0 y el mapa recupera físicamente el ancho completo disponible. La pestaña de colapso se mantiene anclada al borde real de `--workspace-panel-width`; en estado visible usa `z-index: 701`, justo por encima del panel (`700`) y de su sombra, sin superar al header (`760`).

## Divisores y control de detalle

- El eje punteado vertical entre países permanece eliminado.
- Cada límite entre origen/trayecto y entre trayectos usa únicamente una línea horizontal de 1 px con el patrón `#c9ced7` durante 3 px y 4 px transparentes.
- La línea punteada comienza en `53px`, exactamente en el inicio del track independiente de bandera después de drag/número, y termina a `4px` del borde derecho de la fila, coincidiendo con el final visual del SVG del tache. El X mide visualmente 14 px y el bloque de acciones conserva 4 px de padding derecho para mantener esa guía.
- Los picos/triángulos Atlas laterales quedan eliminados. El card conserva un borde lateral limpio y una superficie blanca continua.
- La franja azul lateral introducida en una iteración anterior permanece eliminada.
- `Nota / Desplegar / Cerrar` mantienen ese orden. `Desplegar` se representa mediante `IconChevronDown` de 14 px dentro de un botón cuyo ancho visual también es 14 px.
- `Desplegar` no monta contenido inline: sigue siendo el disparador del módulo flotante de detalles sobre el mapa.

## Formulario de fechas y gastos en modal

- El formulario continúa fuera de la lista. `SegmentForm` y la fila de origen no montan `SegmentBody`/`OriginBody` debajo de la fila ni usan `aria-expanded` para este flujo.
- Aunque la fecha se elimina del resumen de cada fila, las fechas canónicas siguen editándose únicamente dentro del modal de detalles.
- Al pulsar el control Desplegar, se abre sobre el mapa una superficie `segnote segment-details-modal`, reutilizando radio, sombra, cabecera, cierre y posición del modal de notas.
- Sólo puede estar activa una superficie contextual entre nota y detalles; abrir una cierra la otra. Pulsar fuera o cerrar la cabecera descarta la superficie sin alterar datos.
- Mientras el modal de detalles está abierto, la pestaña de colapso del panel principal se oculta temporalmente y no recibe eventos; así no puede atravesar ni competir con la superficie de captura.
- El modal de un destino reutiliza el `SegmentBody` canónico y sus callbacks existentes `updateSegment`/`updateExpenses`.
- El modal del origen reutiliza `OriginBody`, `updateOriginDetails` y `updateOriginExpenses`; no crea un segmento artificial ni una ruta de persistencia distinta.
- Como el mapa ya comienza físicamente después del panel integrado, Nota y Detalles usan un gutter local de 14 px respecto al borde izquierdo del mapa. La búsqueda se centra horizontalmente dentro del ancho real de `.mappane` y no comparte ese gutter. El modal de detalles usa `min(446px, calc(100% - 28px))` en escritorio y no vuelve a restar el ancho del panel una segunda vez.
- Nota y Detalles arrancan 12 px por debajo de la cota que usaban bajo el header: `top: calc(var(--trip-header-height) + 12px)`. El panel integrado no se desplaza por este cambio y la búsqueda conserva su colocación actual.
- Fechas y conceptos comparten exactamente dos columnas `1fr / 1fr` respecto al eje central, con gap de 10 px en escritorio. Ninguna mitad puede reservar un sobrante lateral propio.
- El body del modal usa padding horizontal simétrico de 8 px. En viewports intermedios puede reducirse a 7 px y el gap central a 8 px para conservar legibilidad.
- Los contenedores de fechas y conceptos eliminan padding lateral residual y ocupan el 100% del body del modal.
- Cada control de fecha ocupa el 100% de su mitad; el trigger también fuerza `width: 100%` y el texto dispone de `calc(100% - 30px)`. Sólo se reserva el espacio real del botón de limpiar, ubicado a 5 px del borde derecho.
- Cada concepto fijo se centra como un bloque adaptativo dentro de la mitad correspondiente: icono de 18 px, etiqueta entre 64 y 82 px e importe entre 60 y 70 px, con 4 px entre tracks. El bloque usa `width: min(178px, calc(100% - 12px))`, por lo que conserva al menos 6 px de aire a cada lado cuando la mitad es estrecha y su centro coincide con el del campo de fecha superior.
- Cada concepto dinámico de `Otro/Other` reutiliza exactamente la misma retícula `18px / 64–82px / 60–70px`, el mismo ancho adaptativo máximo de 178 px y el mismo centrado de los conceptos fijos. El botón de eliminar queda fuera de esos tres tracks para no desalinear icono, texto ni importe.
- El salto vertical entre `Taxi/Comida` y el primer concepto dinámico, entre conceptos dinámicos y hacia el control para agregar otro usa exactamente `--expense-row-gap`; no existe margen especial para la sección dinámica.
- En viewports intermedios/móviles el track de importe puede reducirse hasta 60 px dentro del mismo bloque adaptativo, manteniendo el eje de cada mitad y evitando solapamientos.
- La fecha única del origen ocupa la primera celda de la misma rejilla hipotética de dos fechas, de modo que la segunda columna de conceptos mantiene la misma guía que los destinos.
- El calendario de inicio usa fecha fin como máximo y el de fin usa fecha inicio como mínimo; `SegmentBody` sigue bloqueando `startDate > endDate` también ante cambios programáticos.
- Los triggers de fecha conservan exactamente la misma altura, fondo y estados de interacción; únicamente aumenta el ancho útil de campo y texto dentro del modal.
- Las etiquetas de conceptos conservan 13 px; SVG 15 px; caja horizontal del icono 18 px; importes 12 px; prefijo monetario 11 px; `Otro/Other` 13 px. El modal no vuelve a aplicar la vieja miniaturización de `FloatingEditorPolish.css` al contenido.
- Los campos de cantidad siguen filtrando caracteres inválidos, limitan a dos decimales, presentan separador de miles y envían `number` canónico al dominio.
- `Tren` usa rojo, `Vuelo/Flight` usa morado y `Taxi` rosa; el campo persistido para vuelo continúa siendo `plane` y el de taxi continúa siendo `taxiUber`.
- `Otro/Other` sigue modificando `expenses.others` y conserva la misma rejilla; los viajes heredados con alimentos mantienen su fila de compatibilidad sin costo oculto.

## Notas, origen y acciones existentes

- Los botones de nota de origen y trayectos siguen abriendo la misma superficie `.segnote` sobre el mapa, con textarea, contador, estado de persistencia y cierre.
- El título de ciudad del modal de nota y el nombre de ciudad en resultados de autocompletado permanecen en 13 px / 600; la fila seleccionada se normaliza a la misma escala/peso para una lectura consistente.
- La nota del origen continúa en `originDetails.note`, limitada a 500 caracteres y validada por Rules v3/v4 como campo opcional.
- Los gastos del origen continúan participando en el `Total del viaje` y su desglose, sin total independiente al pie del origen.
- La edición del modal de detalles usa exactamente el mismo autosave/sync incremental que la edición inline anterior; mover la presentación no cambia el contrato persistido.
- La lista compacta no ejecuta `scrollIntoView`, no reserva `scroll-margin` y no reposiciona el panel al abrir datos.

## Resto del mapa y aplicación

- `AppWorkspaceMenu` conserva su anclaje flotante fijo al viewport. El panel integrado no usa `transform` en estado abierto, por lo que el botón azul de tres puntos conserva su referencia al viewport; el colapso completo del módulo izquierdo sigue liberando el mapa.
- Los overlays de nota, detalles y búsqueda viven dentro de la columna real del mapa. Nota y Detalles usan `left: 14px` desde el borde izquierdo de `.mappane`; la búsqueda usa `left: 50%` y `translateX(-50%)` dentro de esa misma columna para quedar centrada en el área de mapa realmente visible.
- La instalación PWA sólo aparece cuando el navegador emite `beforeinstallprompt`.
- La búsqueda de lugares conserva sus componentes y proveedores actuales; seleccionar una sugerencia enfoca su resultado y la confirmación permanece anclada al marcador.
- El marcador final mantiene el banderín SVG de 18 × 18 px y los puntos intermedios mantienen núcleo visual de 7 × 7 px más borde fino.
- Los landmarks editoriales siguen visibles únicamente en vista `segments` mediante una sola `WebGLOverlayView`, con la colección curada y el handoff gradual a landmarks nativos de Google ya definidos.
- Los assets de landmarks siguen siendo locales y no reutilizan assets internos de Google Maps.
- Las rutas entre ciudades se representan únicamente mediante la línea punteada existente; no se dibujan flechas, chevrons ni otros indicadores negros de dirección sobre el trazo.
- La primera proyección de un itinerario que ya llega cargado puede encuadrarse una vez. Después de esa proyección, agregar, quitar o reordenar ciudades no ejecuta `panTo`, `setZoom` ni `fitBounds`: centro y zoom quedan exactamente en la posición elegida por el usuario.

## Rendimiento y arquitectura

- El header reutiliza cálculos existentes (`total`, `breakdown`, checklist y `tripSummary.startDate/endDate`) y no introduce solicitudes nuevas.
- El rango de fechas es una proyección local determinista de las fechas canónicas ya presentes en los trayectos; mostrarlo no añade campos persistidos, consultas ni llamadas a proveedores.
- El formulario de gastos reutiliza `segment.expenses`/`originDetails.expenses`; mantenerlo en el modal no añade writers, timers, colecciones, mutaciones o provider requests.
- Sólo se monta el formulario detallado del target activo; las otras filas permanecen compactas y no mantienen editores de gastos ocultos en el DOM.
- Restaurar el panel integrado es presentación únicamente: no recorta, reordena ni transforma `trip.segments`, no introduce paginación/virtualización y no cambia el estado de dominio.
- El formateo de moneda de la fila es local mediante `Intl.NumberFormat`; eliminar la fecha del resumen evita trabajo de presentación pero no modifica las fechas canónicas persistidas.
- La sanitización de importes, validación de fechas y formato siguen siendo funciones locales deterministas.
- La proyección enviada al mapa contiene únicamente los campos que afectan representación; editar fechas o costos no debe recrear rutas/marcadores si la proyección cartográfica no cambia.
- Los SVG de ruta se reconcilian sobre los mismos nodos existentes y reciben su nueva geometría sin vaciar primero la capa; agregar o reordenar un trayecto no introduce un frame intermedio sin trazos.
- Los `AdvancedMarkerElement` del itinerario se indexan por coordenada estable. Si una ciudad ya existe, se actualizan en el mismo marker su posición, título, z-index, color y número; sólo se crea un marker para una ciudad nueva y sólo se desmonta el de una ciudad que dejó de existir.
- El efecto de proyección no limpia trazos, landmarks ni marcadores en su cleanup normal. La siguiente proyección reconcilia el estado sobre los nodos existentes; el desmontaje completo ocurre únicamente al abandonar la vista o destruir el mapa.
- Storage v4, Firestore Rules, Functions, App Check, migraciones, providers y autosave conservan exactamente sus rutas actuales.
- Se mantiene un único marcador lógico por ciudad y una sola `WebGLOverlayView` para landmarks; el cambio de render no introduce persistencia ni requests adicionales.

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

## Mis Rutas organizadas por día

- `Mis Rutas` se agrupa por ciudad destino y cada día inclusivo derivado de `startDate` / `endDate` del itinerario.
- Cada bloque diario muestra ciudad, país, día global del viaje y fecha, y reutiliza un único color por país de la paleta ya existente de Atlas.
- Cada bloque usa un nodo y rail vertical punteado; cada lugar guardado se representa mediante un punto dentro de esa secuencia.
- Cada lugar conserva acciones compactas para mover/reordenar, editar su nota y eliminarlo.
- El drag y las flechas de teclado reordenan únicamente dentro del mismo bloque ciudad+día; `Mover a…` es la operación explícita para reasignar entre días o ciudades.
- Al guardar con varios días disponibles se muestra un selector de ciudad+día; con un único día la asignación es directa. Sin al menos una ciudad destino con fechas válidas, el guardado de lugares se bloquea con feedback traducido.
- Los lugares históricos sin asignación válida permanecen visibles en `Por organizar`; no se eliminan ni se reinterpretan silenciosamente.
- Reducir/eliminar fechas o cambiar/eliminar una ciudad no puede dejar lugares asignados fuera del rango; primero deben moverse o eliminarse.
- Las conexiones entre lugares sólo se aceptan dentro del mismo bloque ciudad+día y se eliminan cuando una reasignación/reordenación las vuelve obsoletas.
- Storage v4 persiste `segmentId`, `dayOffset` y `note`; Firestore Rules mantiene compatibilidad con documentos v4 anteriores que todavía no contienen esos campos.
- Los lugares Google continúan excluyendo de persistencia sus datos transitorios de proveedor; la asignación diaria y la nota sí sobreviven al guardado/rehidratación.
- Este delta no rediseña header, gastos, notas, cámara del mapa, proveedores ni navegación fuera del alcance de `Mis Rutas` y el selector de día asociado.

## Ajuste solicitado: Mis Rutas flexible por ciudad

- Este apartado amplía y, donde haya conflicto, sustituye únicamente las reglas anteriores de `Mis Rutas`; el resto del contrato visual permanece intacto.
- Cada visita se presenta con una sola cabecera `Bandera · Ciudad, País`. Sus días se anidan debajo como `Día N · fecha`; la ciudad deja de repetirse en cada día.
- La cabecera de cada ciudad puede contraer o expandir todos sus días y lugares sin modificar el estado persistido del viaje.
- Cuando cambia el país entre visitas se muestra un divisor horizontal gris tenue; no se introduce una tarjeta de país ni otra capa de navegación.
- El rail punteado y todos los nodos de día/lugar comparten exactamente un mismo eje horizontal. El fondo/hover de una fila empieza a la derecha del carril, de forma que nunca cubre ni corta la línea punteada.
- El drag y `Mover a…` permiten reorganizar un lugar entre cualquier día válido del itinerario; no existe un bloqueo por país. Al cruzar de día se actualiza `segmentId + dayOffset` y se eliminan sólo las conexiones que ya no representan lugares consecutivos del mismo día.
- Guardar un resultado de búsqueda ya no abre el selector masivo ciudad+día. Atlas intenta primero una coincidencia exacta con una ciudad del itinerario y, en segundo lugar, una asociación geográfica cercana y compatible con el país; en ambos casos lo coloca en el Día 1 de esa visita.
- Si la asociación no es suficientemente segura, el lugar se guarda en `Por organizar` en vez de rechazarse o adivinar una ciudad. El usuario puede moverlo después a cualquier día válido.
- Las notas de lugar adoptan la misma semántica de las notas de trayecto: textarea controlado, actualización en cada `onChange`, contador de 500 caracteres, estado de persistencia/autosave y cierre sin un botón independiente de Guardar.
- El buscador de lugares de escritorio se centra en el área visible comprendida entre el borde derecho real de `--workspace-panel-width` y el borde derecho del workspace. Al colapsar el panel vuelve al centro del ancho completo; no se usan offsets fijos duplicados.
- No cambian el proveedor de búsqueda, el autocompletado, las reglas de cámara, los marcadores de ciudades, Storage v4, Firestore Rules, Functions ni la política de datos Google por este ajuste.

## Ajuste solicitado: shell compacto del buscador de lugares

- En escritorio el contenedor exterior del buscador conserva su centro geométrico en `.mappane`, pero deja de reservar columnas laterales artificiales y usa un ancho máximo de 550 px, limitado además por `calc(100% - 32px)`.
- La fila del buscador contiene únicamente dos tracks reales: `minmax(0, 1fr)` para el input y `auto` para la acción Buscar. No existe pseudo-elemento ni track fantasma para compensar el botón.
- El listado de sugerencias vive dentro de `.geo-search__input-wrap`, por lo que su borde izquierdo, borde derecho y ancho siguen exactamente al campo de búsqueda incluso cuando el ancho disponible cambia.
- Este ajuste no modifica el centrado respecto al mapa, el comportamiento móvil existente, proveedores, búsqueda/autocompletado, selección de resultados, cámara, persistencia ni Storage v4.

## Ajuste solicitado: paridad visual de notas en Mis Rutas

- La nota de un lugar guardado conserva la misma semántica existente de edición/autosave, pero su superficie visual usa exactamente la geometría canónica de `.segnote`: 300 px de ancho en escritorio, radio de 12 px, fondo blanco y sombra `0 6px 24px rgba(0, 0, 0, 0.16)`.
- Cabecera, título, cierre, textarea, estado de persistencia y contador continúan usando las mismas clases `segnote__*` que origen y trayectos; no se introduce una segunda tipografía, espaciado ni formato de footer.
- El scrim de la nota de lugar sólo captura el clic exterior y permanece transparente, igual que la capa de descarte de las notas de trayecto; el diálogo de confirmación para eliminar un lugar conserva su scrim oscuro existente.
- El posicionamiento contextual de la nota de `Mis Rutas` puede permanecer centrado respecto al viewport; la solicitud de paridad afecta diseño, forma y formato de la superficie, no su anclaje.
- Este ajuste no modifica contenido de notas, límite de 500 caracteres, callbacks, autosave, Storage v4, Firestore Rules, rutas, proveedores, cámara ni costos externos.

## Ajuste solicitado: mudanza total de Itinerario a Mis Rutas

- Este apartado sustituye, donde exista conflicto, las reglas anteriores que trataban `Itinerario` y `Mis Rutas` como superficies separadas.
- La navegación primaria queda reducida a `Mis Rutas / Notas`; `Mis Rutas` es la vista inicial del editor. No se mantiene una pestaña paralela de Itinerario escondida ni una segunda ruta de edición.
- `Mis Rutas` pasa a ser dueña visual de la ciudad origen y de todas las ciudades destino, pero reutiliza el mismo estado `trip.origin` / `trip.segments` y los mismos callbacks de dominio (`updateOrigin`, `updateSegment`, `addSegment`, `removeSegment`, `reorderSegment`).
- Cada ciudad usa una sola barra compacta de 40 px. La reducción de espacio vertical no usa `scale`, `zoom` ni miniaturización tipográfica.
- Cada ciudad tiene un divisor horizontal tenue respecto a la siguiente aunque ambas pertenezcan al mismo país. Esta regla sustituye la antigua condición que sólo mostraba el divisor cuando cambiaba el país.
- La barra mantiene en una sola línea bandera, ciudad/país, resumen de fecha, costo, acceso a gastos, nota y despliegue. Nombres largos deben ceder espacio mediante `minmax(0, 1fr)` y elipsis sin empujar fuera de la retícula las acciones finales.
- Expandir una ciudad muestra sus días, lugares y controles de gestión. Agregar, editar, reordenar y eliminar ciudades siguen disponibles sin volver a montar `SegmentForm` como segunda superficie de producto.
- Fecha y costo de la barra son proyecciones locales; al pulsarlos, igual que al pulsar Gastos, se abre el `ItineraryDetailsModal` canónico. Notas reutiliza los targets y el autosave existentes.
- La ciudad origen usa `trip.origin` como fuente canónica también dentro del modal de detalles; no se deriva de `firstSegment.origin` ni se crea un origen duplicado.
- En el mapa de `Mis Rutas` existe un selector `Ciudades / Rutas`. `Ciudades` reutiliza la proyección `segments`; `Rutas` reutiliza la proyección `places`, el buscador existente y las conexiones guardadas. No se crea un segundo mapa, un proveedor alternativo ni nuevas llamadas por duplicación de render.
- El selector de mapa sólo cambia presentación. Storage v4, Firestore Rules, Functions, App Check, Google Places, Geoapify, autosave, contratos de fechas, gastos, notas, lugares y conexiones permanecen en sus rutas canónicas actuales.

## Ajuste solicitado: correcciones de búsqueda, mapa y filas de Mis Rutas (PR #85)

- Este apartado es autoritativo para las correcciones de PR #85 y sustituye únicamente las reglas históricas incompatibles de los apartados anteriores.
- El buscador general sigue siendo una sola superficie visible, pero no ejecuta fan-out Geoapify + Google ni concatena dos listas simultáneas. La intención se enruta primero a un proveedor; si una búsqueda orientada a ciudad no obtiene una coincidencia válida, puede caer secuencialmente a Google respetando el mínimo y debounce propios de Google.
- Geoapify continúa siendo el proveedor de ciudades y Google el proveedor de establecimientos/lugares. Seleccionar una sugerencia de ciudad produce sólo un resultado `city`; seleccionar una sugerencia Google produce sólo un resultado `place`.
- El selector de mapa activo es `Ciudades / Lugares`: `Ciudades` controla el trazo del itinerario y `Lugares` controla únicamente la visibilidad de marcadores de lugares guardados. Las rutas/conexiones guardadas permanecen independientes y no se apagan al ocultar `Lugares`.
- La barra de cada ciudad permanece en 40 px. Fecha e importe son texto informativo, sin cursor ni acción propia; el único acceso al panel canónico de fechas/gastos desde esa zona es el icono de gastos. Cuando no existe rango completo de fechas se muestra la guía traducida `dd/mm – dd/mm`.
- El control de eliminar ciudad vive dentro de la misma retícula de la fila. En escritorio con puntero preciso permanece oculto hasta hover de la barra o foco de teclado; en dispositivos sin hover sigue disponible sin depender de esa condición.
- El reordenamiento de ciudades conserva el drag por puntero y `pointercancel` nunca confirma el cambio. No se reemplaza por botones de subir/bajar.
- Los lugares pueden permanecer asociados a una ciudad que todavía no tenga rango completo de fechas. La validación `assignedPlacesOutOfRange` sólo bloquea cuando existe un rango completo candidato y éste excluiría realmente un `dayOffset` ya asignado.
- El título del modal de detalles de una ciudad muestra la ciudad destino; no vuelve a construir `Origen → destino` ni reinstala un pivote de origen visual.
- El buscador de escritorio mantiene su centro geométrico dentro de `.mappane`, pero su máximo solicitado para esta superficie baja a 440 px y puede reducirse proporcionalmente con `--geo-search-max-width`; no mueve el borde derecho calculado de `Mis Rutas`.
- Estas correcciones no cambian Storage v4, Firestore Rules, Functions, App Check, autosave, esquema persistido, credenciales ni políticas de datos de proveedores.
