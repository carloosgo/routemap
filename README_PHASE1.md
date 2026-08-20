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

La revisión automática de GitHub rechaza cambios en hojas o carpetas de estilos dentro de este PR.

## Cambios incluidos

- Preservación de identificadores de segmentos al cargar viajes.
- Validación estricta de latitud y longitud.
- Prevención de coordenadas falsas `0,0` provocadas por valores vacíos.
- Mensajes de error de API sin exponer respuestas internas del servidor.
- Normalización de la URL base de la API.
- Selección correcta de `POST` para viajes nuevos y `PUT` para viajes ya persistidos.
- Manejo consistente de errores al cargar, guardar y eliminar viajes.
- Pruebas de regresión del modelo de viajes mediante `node --test`.
- Pruebas de persistencia local y del repositorio API.
- Flujo de GitHub Actions para ejecutar pruebas, ESLint y build en cada cambio.

## Validación automática

GitHub Actions ejecuta:

```bash
npm ci
npm test
npm run lint
npm run build
```

El último flujo de validación terminó correctamente.
