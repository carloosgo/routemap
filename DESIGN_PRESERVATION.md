# Contrato de preservación visual

Visual delta: none

La interfaz puede incorporar capacidades nuevas, pero el lenguaje visual de Atlas debe permanecer intacto. Los controles añadidos reutilizan componentes, dimensiones, espaciados, iconografía y estados ya existentes.

## Invariantes

- No cambiar paleta, tipografías, tamaños, radios, sombras ni espaciados existentes.
- No mover, ocultar, eliminar ni redimensionar controles actuales.
- No cambiar la jerarquía visual ni el comportamiento responsive existente.
- No renombrar clases sin conservar reglas y especificidad equivalentes.
- Los nuevos controles deben reutilizar componentes, dimensiones y estados visuales existentes.
- Las reglas de accesibilidad no deben producir cambios visibles salvo foco de teclado cuando corresponda.
- Cualquier modularización CSS debe conservar el orden efectivo de las reglas y el resultado de la cascada.

## Controles incorporados

- Selector `KM / MI`: reutiliza `topmenu`, `topitem`, `dropdown` y `dropdown__opt`.
- Instalación PWA: reutiliza `topitem` y solo aparece cuando el navegador emite `beforeinstallprompt`.
- Búsqueda de lugares: conserva los componentes visuales existentes; la sugerencia seleccionada ahora se enfoca directamente y la confirmación permanece anclada a su marcador.
- No se añadieron colores, tamaños, bordes, sombras o animaciones nuevos.

## Validación requerida

- `npm test`
- `npm run lint`
- `npm run build`
- Revisión de escritorio y móvil antes de integrar.
- Comparación visual de las pantallas principales cuando el entorno de despliegue esté disponible.
