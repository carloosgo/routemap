# Fase 1 — mejoras internas sin cambios de diseño

Esta rama contiene únicamente cambios de estabilidad, seguridad y consistencia de datos.

## Regla de alcance

No modificar:

- CSS
- distribución visual
- colores
- tamaños
- tipografías
- textos visibles
- animaciones
- comportamiento visual

## Cambios incluidos

- Preservación de identificadores de segmentos al cargar viajes.
- Validación estricta de latitud y longitud.
- Prevención de coordenadas falsas `0,0` provocadas por valores vacíos.
- Mensajes de error de API sin exponer respuestas internas del servidor.
- Pruebas de regresión del modelo de viajes mediante `node --test`.

## Validación local

```bash
npm install
npm test
npm run lint
npm run build
```
