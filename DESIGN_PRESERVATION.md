# Contrato de preservación visual

Visual delta: none

Los cambios de esta fase pueden reorganizar JSX y CSS o añadir estilos estrictamente necesarios para accesibilidad y nuevas capacidades, pero deben conservar la apariencia actual de Atlas.

## Invariantes

- No cambiar paleta, tipografías, tamaños, radios, sombras ni espaciados existentes.
- No mover, ocultar, eliminar ni redimensionar controles actuales.
- No cambiar la jerarquía visual ni el comportamiento responsive existente.
- No renombrar clases sin conservar reglas y especificidad equivalentes.
- Los nuevos controles deben reutilizar componentes, dimensiones y estados visuales existentes.
- Las reglas de accesibilidad no deben producir cambios visibles salvo foco de teclado cuando corresponda.
- Cualquier modularización CSS debe conservar el orden efectivo de las reglas y el resultado de la cascada.

## Validación requerida

- `npm test`
- `npm run lint`
- `npm run build`
- Revisión de escritorio y móvil antes de integrar.
- Comparación visual de las pantallas principales cuando el entorno de despliegue esté disponible.
