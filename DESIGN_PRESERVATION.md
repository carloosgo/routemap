# Contrato de preservación visual

Visual delta: requested
Requested visual scope: selectores de moneda/idioma del header global; contenido y validación de cada trayecto; navegación primaria dentro del header; panel flotante sobre el mapa; eliminación del eje vertical y uso de divisores punteados sin picos laterales; unificación de ciudad origen con destinos; vista compacta con scrollbar visible; filas de 40 px sin reducir bandera; eliminación del país y de la fecha en el resumen de fila; campo ciudad de 126 px; Costo como único dato textual del resumen antes de Nota / Desplegar / Cerrar; espaciado visual uniforme de 8 px entre Costo, Nota, Desplegar y Cerrar usando el ancho real de iconos de 14 px; autoridad final de `ItineraryCompactTen.css` para impedir que geometrías legacy de Fecha/Noches/acciones vuelvan a pisar la retícula compacta; reducción del inset lateral del itinerario a 8 px; divisores limitados desde el inicio de la bandera hasta el final visual del tache de cerrar; unificación de Itinerario, Mis Rutas y Notas al mismo panel flotante de 426 × 506 px, centrado verticalmente bajo el header; mantenimiento del formulario de fechas/gastos en una superficie flotante sobre el mapa al estilo `.segnote`; aprovechamiento completo y simétrico del ancho del modal de detalles, con dos mitades iguales, fechas más legibles y etiquetas largas sin truncamiento innecesario; y conservación del resto de la arquitectura, solicitado explícitamente por el product owner.

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

## Panel flotante compartido

- En escritorio el mapa ocupa el 100% del workspace y `Itinerario`, `Mis Rutas` y `Notas` se muestran dentro de la misma tarjeta blanca flotante con radio de 12 px y sombra ligera.
- Las tres vistas usan exactamente la misma geometría: ancho de 426 px y alto de 506 px. El panel queda a `left: 34px` y se centra verticalmente en el área útil bajo el header contractual de 63 px; cambiar de pestaña no mueve ni redimensiona la tarjeta.
- En viewports bajos el panel puede reducir su alto mediante `max-height`, sin cambiar el tamaño de filas, banderas, iconos o tipografías; el contenido interno conserva scrollbar.
- Las banderas conservan 30 × 20 px y el campo ciudad usa 126 px. La reducción del panel no se obtiene escalando tipografía, iconos, banderas o inputs.
- La antigua densidad artificial equivalente al navegador al 90% queda retirada: no se escalan ni comprimen tipografías, banderas, iconos, inputs o controles para simular zoom.
- La lista mantiene un scrollbar visible (`scrollbar-width: thin` / 7 px en WebKit) y `scrollbar-gutter: stable`; no se usa `scrollIntoView` ni se reposiciona el panel al abrir detalles.
- `editor__body` usa 0 px arriba y 8 px a cada lado. La banda de origen y cada destino usa 40 px sin cambiar el tamaño interno de sus elementos.
- La ciudad origen no es un bloque visual especial: usa la misma altura, tipografía, bandera, guía de ciudad, costo y acciones que cualquier destino. La única diferencia geométrica permitida es ocupar el espacio del drag handle que el origen no necesita.
- Origen y destinos usan una banda exacta de 40 px. Todos los elementos quedan centrados verticalmente entre divisores.
- El país deja de mostrarse en la fila; sólo aparece el nombre de la ciudad. El nombre seleccionado usa 13 px / 600, una sola línea y no utiliza `translateY`, para evitar suavizado subpíxel innecesario.
- La fecha y el número de noches no aparecen en el resumen compacto. Después de la ciudad, la retícula visible contiene únicamente `Costo / Nota / Desplegar / Cerrar`.
- `ItineraryCompactTen.css` es la autoridad final de esta retícula y se carga después de `ItineraryTripHeader.css` y `FloatingItineraryPanel.css`; las reglas legacy no pueden redefinir columnas de Fecha/Noches ni volver a reservar 22 px por acción.
- El bloque `Costo / Nota / Desplegar / Cerrar` usa `width: max-content`, alineación al extremo derecho y una retícula de `110px repeat(3, 14px)`. Los tres iconos usan su ancho visual real de 14 px; no se reservan columnas artificiales de 22 px.
- El espacio visible entre el borde derecho de `Costo` y `Nota`, entre `Nota` y `Desplegar`, y entre `Desplegar` y `Cerrar` es exactamente 8 px. El conjunto conserva 4 px de padding derecho para mantener el X en la posición visual aprobada.
- Los botones icon-only pueden extender su área clicable mediante una capa transparente absoluta, pero esa capa no participa en el ancho de la retícula ni altera las distancias visuales.
- `Costo` se muestra como texto plano de 12 px / 400 y color exacto `#117b80`, alineado a la derecha dentro de un track de 110 px. No utiliza pill, fondo, borde ni peso bold.
- El botón de nota, el botón de desplegar y el botón eliminar/cerrar conservan el aspecto icon-only. En origen, el botón X sigue limpiando únicamente la ciudad seleccionada y no borra silenciosamente fechas, gastos o nota.

## Divisores y control de detalle

- El eje punteado vertical entre países permanece eliminado.
- Cada límite entre origen/trayecto y entre trayectos usa únicamente una línea horizontal de 1 px con el patrón `#c9ced7` durante 3 px y 4 px transparentes.
- La línea punteada comienza en `24px`, exactamente en el inicio de la bandera, y termina a `4px` del borde derecho de la fila, coincidiendo con el final visual del SVG del tache. El X mide visualmente 14 px y el bloque de acciones conserva 4 px de padding derecho para mantener esa guía.
- Los picos/triángulos Atlas laterales quedan eliminados. El card conserva un borde lateral limpio y una superficie blanca continua.
- La franja azul lateral introducida en una iteración anterior permanece eliminada.
- `Nota / Desplegar / Cerrar` mantienen ese orden. `Desplegar` se representa mediante `IconChevronDown` de 14 px dentro de un botón cuyo ancho visual también es 14 px.
- `Desplegar` no monta contenido inline: sigue siendo el disparador del módulo flotante de detalles sobre el mapa.

## Formulario de fechas y gastos en modal

- El formulario continúa fuera de la lista. `SegmentForm` y la fila de origen no montan `SegmentBody`/`OriginBody` debajo de la fila ni usan `aria-expanded` para este flujo.
- Aunque la fecha se elimina del resumen de cada fila, las fechas canónicas siguen editándose únicamente dentro del modal de detalles.
- Al pulsar el control Desplegar, se abre sobre el mapa una superficie `segnote segment-details-modal`, reutilizando radio, sombra, cabecera, cierre y posición del modal de notas.
- Sólo puede estar activa una superficie contextual entre nota y detalles; abrir una cierra la otra. Pulsar fuera o cerrar la cabecera descarta la superficie sin alterar datos.
- El modal de un destino reutiliza el `SegmentBody` canónico y sus callbacks existentes `updateSegment`/`updateExpenses`.
- El modal del origen reutiliza `OriginBody`, `updateOriginDetails` y `updateOriginExpenses`; no crea un segmento artificial ni una ruta de persistencia distinta.
- El modal calcula su ancho con la geometría real del panel compartido (`left 34px + width 426px`) y aprovecha todo el ancho interior disponible; desaparece la antigua caja interna limitada a 394 px.
- Fechas y conceptos comparten exactamente dos columnas `1fr / 1fr` respecto al eje central, con gap de 14 px en escritorio. Ninguna mitad puede reservar un sobrante lateral propio.
- El body del modal usa padding horizontal simétrico de 12 px. En viewports intermedios puede reducirse a 10 px y el gap central a 12 px para conservar legibilidad.
- Los controles de fecha ocupan el 100% de su mitad y su texto dispone de `calc(100% - 38px)`; se reserva únicamente el espacio necesario para limpiar el valor, evitando truncamientos como `dd/mm/aa...` cuando existe ancho suficiente.
- Cada concepto del modal usa una retícula explícita `18px / etiqueta flexible / 70px`. El gap interno es 4 px; el importe conserva su track propio y etiquetas como `Hospedaje` o `Autobús` no usan ellipsis en el ancho normal del modal.
- En viewports intermedios/móviles el track de importe puede bajar a 66 px, manteniendo las dos mitades y evitando solapamientos.
- La fecha única del origen ocupa la primera celda de la misma rejilla hipotética de dos fechas, de modo que la segunda columna de conceptos mantiene la misma guía que los destinos.
- El calendario de inicio usa fecha fin como máximo y el de fin usa fecha inicio como mínimo; `SegmentBody` sigue bloqueando `startDate > endDate` también ante cambios programáticos.
- Los triggers de fecha conservan exactamente la misma altura, fondo y estados de interacción; únicamente aumenta el ancho útil de texto dentro del modal.
- Las etiquetas de conceptos conservan 13 px; SVG 15 px; caja horizontal del icono 18 px; importes 12 px; prefijo monetario 11 px; `Otros gastos` 13 px. El modal no vuelve a aplicar la vieja miniaturización de `FloatingEditorPolish.css` al contenido.
- Los campos de cantidad siguen filtrando caracteres inválidos, limitan a dos decimales, presentan separador de miles y envían `number` canónico al dominio.
- `Tren` usa rojo, `Avión` morado y `Taxi` rosa; el campo persistido continúa siendo `taxiUber`.
- `Otros gastos` sigue modificando `expenses.others` y conserva la misma rejilla; los viajes heredados con alimentos mantienen su fila de compatibilidad sin costo oculto.

## Notas, origen y acciones existentes

- Los botones de nota de origen y trayectos siguen abriendo la misma superficie `.segnote` sobre el mapa, con textarea, contador, estado de persistencia y cierre.
- El título de ciudad del modal de nota y el nombre de ciudad en resultados de autocompletado permanecen en 13 px / 600; la fila seleccionada se normaliza a la misma escala/peso para una lectura consistente.
- La nota del origen continúa en `originDetails.note`, limitada a 500 caracteres y validada por Rules v3/v4 como campo opcional.
- Los gastos del origen continúan participando en el `Total del viaje` y su desglose, sin total independiente al pie del origen.
- La edición del modal de detalles usa exactamente el mismo autosave/sync incremental que la edición inline anterior; mover la presentación no cambia el contrato persistido.
- La lista compacta no ejecuta `scrollIntoView`, no reserva `scroll-margin` y no reposiciona el panel al abrir datos.

## Resto del mapa y aplicación

- `AppWorkspaceMenu` conserva su anclaje flotante y el colapso completo del módulo izquierdo sigue liberando el mapa.
- Los overlays de nota, detalles y búsqueda permanecen por debajo del header fijo y a la derecha del panel compartido, calculados a partir de 34 px + 426 px + 14 px de gutter.
- El selector `KM / MI` reutiliza `topmenu`, `topitem`, `dropdown` y `dropdown__opt`.
- La instalación PWA sólo aparece cuando el navegador emite `beforeinstallprompt`.
- La búsqueda de lugares conserva sus componentes y proveedores actuales; seleccionar una sugerencia enfoca su resultado y la confirmación permanece anclada al marcador.
- El marcador final mantiene el banderín SVG de 18 × 18 px y los puntos intermedios mantienen núcleo visual de 7 × 7 px más borde fino.
- Los landmarks editoriales siguen visibles únicamente en vista `segments` mediante una sola `WebGLOverlayView`, con la colección curada y el handoff gradual a landmarks nativos de Google ya definidos.
- Los assets de landmarks siguen siendo locales y no reutilizan assets internos de Google Maps.

## Rendimiento y arquitectura

- El header reutiliza cálculos existentes (`total`, `breakdown`, checklist) y no introduce solicitudes nuevas.
- La distancia permanece como cálculo local lineal sobre los trayectos.
- El formulario de gastos reutiliza `segment.expenses`/`originDetails.expenses`; mantenerlo en el modal no añade writers, timers, colecciones, mutaciones o provider requests.
- Sólo se monta el formulario detallado del target activo; las otras filas permanecen compactas y no mantienen editores de gastos ocultos en el DOM.
- El scrollbar visible y la geometría compartida de 426 × 506 px son presentación únicamente: no recortan, reordenan ni transforman `trip.segments` y no introducen paginación, virtualización ni un segundo estado de dominio.
- El formateo de moneda de la fila es local mediante `Intl.NumberFormat`; eliminar la fecha del resumen evita trabajo de presentación pero no modifica las fechas canónicas persistidas.
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