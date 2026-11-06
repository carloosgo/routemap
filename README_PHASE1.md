# Fase 1 — registro histórico

> **Documento histórico.** Describe una etapa temprana del proyecto previa a Firebase/Gate G/Atlas Storage v4. Las referencias a repository REST/API, URL base y decisiones de persistencia de esta página **no describen la arquitectura actual** y no deben usarse como guía de implementación.
>
> Para el estado vigente consulta `README.md`, `ARCHITECTURE.md`, `docs/STORAGE_ARCHITECTURE_V4.md` y los decision records/closeouts posteriores.

Esta fase contenía únicamente cambios de estabilidad, seguridad y consistencia de datos y tenía como restricción no modificar el diseño visual.

## Alcance histórico

En aquel momento se trabajó sobre:

- preservación de identificadores de segmentos al cargar viajes;
- validación estricta de latitud y longitud;
- prevención de coordenadas falsas `0,0` provocadas por valores vacíos;
- manejo consistente de errores al cargar, guardar y eliminar viajes;
- pruebas de regresión del modelo de viajes;
- persistencia local;
- un repository REST experimental con control de errores/concurrencia;
- incorporación inicial de GitHub Actions para tests, ESLint y build.

El repository REST y su contrato fueron posteriormente sustituidos por la arquitectura Firebase/Storage v4 y ya no forman parte del runtime actual.

## Validación que introdujo esta fase

La base de validación automatizada quedó establecida alrededor de:

```bash
npm ci
npm test
npm run lint
npm run build
```

Los workflows actuales agregan contratos de Firestore/Storage v4 y controles adicionales; consultar `.github/workflows/` y la documentación vigente en vez de asumir que esta lista histórica sigue completa.
