# Lista de preparación para producción — registro histórico

> **No usar este archivo como runbook operativo.** Esta checklist nació antes de que Atlas quedara consolidado en Storage v4-only. La fuente vigente para una liberación productiva es `docs/STORAGE_V4_PRODUCTION_ROLLOUT.md`, junto con `docs/FIREBASE_FOUNDATION.md` y `docs/STORAGE_V4_IMPLEMENTATION_STATUS.md`.

## Por qué se conserva

Esta lista documenta los riesgos que guiaron las primeras fases: secretos, proveedores, mapas, autenticación, backups, App Check, observabilidad, privacidad y calidad. Es evidencia histórica, no una secuencia de rollout.

## Principios que siguen vigentes

### Configuración y secretos

- Mantener claves privadas exclusivamente en Secret Manager/backend.
- No versionar secretos, debug tokens ni archivos `.env` reales.
- Separar credenciales dev y prod.
- Restringir claves web públicas por dominio/referrer y APIs permitidas.

### Proveedores, caché y mapas

- Mantener cuotas, validación, freshness/TTL y comportamiento fail-soft.
- Separar dato canónico del usuario de provider cache y datos recalculables.
- Verificar términos/atribuciones de proveedores.
- Medir antes de hacer tuning especulativo.

### Firebase y datos

- Aislar datos por UID mediante Rules y contratos de dominio.
- Mantener recovery, backups y observabilidad por entorno.
- App Check se observa antes de enforcement.
- `atlasmap-dev` es preproducción; `atlasmap-prod` no es backend de pruebas.
- La persistencia autenticada soportada es exclusivamente Storage v4.
- No reintroducir Gate G, v3, hybrid read, dual-write, cohortes de generación o fallback como mecanismo de release/rollback.

### Privacidad y calidad

- Minimizar y aislar datos de usuario.
- Mantener borrado/lifecycle conforme al contrato.
- Mantener Quality, Rules, lint, build, CodeQL y Dependency Audit verdes sobre el mismo SHA entregable.
- Validar experiencia real en navegadores/dispositivos soportados y accesibilidad.

## Preparación productiva vigente

Antes de abrir tráfico productivo deben verificarse, mediante el runbook actual:

- inventario de `atlasmap-prod`;
- Delete Protection/PITR/backups/restore;
- budget y observabilidad;
- Hosting/dominio;
- App Check y reCAPTCHA Enterprise;
- Rules v4;
- Functions/Eventarc v4;
- secretos productivos;
- build apuntando exclusivamente a producción;
- smokes de Auth, lectura, guardado, sync y lifecycle.

La salida es un **release directo v4**. Si se descubre estado legacy inesperado, se detiene el release para inventariarlo; no se reconstruye una arquitectura de transición.

## Evidencia histórica

Los closeouts fechados de agosto de 2026 pueden contener pasos que ya no existen en la arquitectura actual. Deben leerse como evidencia del proceso de construcción, no como tareas pendientes.
