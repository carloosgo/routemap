# Lista de preparación para producción — registro histórico

> **No usar este archivo como fuente de verdad del rollout actual.** Esta checklist nació antes de Atlas Storage v4 y varios puntos aquí listados fueron posteriormente cerrados, redefinidos o movidos a gates explícitos A–L.
>
> El estado vigente debe determinarse con los decision records, closeouts y evidencia cloud más recientes. En particular:
>
> - `docs/STORAGE_V4_IMPLEMENTATION_STATUS.md`
> - `docs/STORAGE_V4_PHASE_K_CLOSEOUT_2026-08-14.md`
> - `docs/STORAGE_V4_OPERATING_STATE_2026-08-15.md` (snapshot histórico; evidencia posterior prevalece)
> - `docs/STORAGE_V4_PRODUCTION_ROLLOUT.md`
> - `docs/STORAGE_V4_PHASE_J_DECISION_2026-08-14.md`
>
> No convertir una casilla antigua de esta página en un bloqueo nuevo sin contrastarla primero con esas fuentes.

## Por qué se conserva

Esta lista documenta los riesgos que guiaron las primeras fases: secretos, proveedores, mapas, autenticación, backups, App Check, observabilidad, privacidad y calidad. Sigue siendo útil como registro histórico, pero **no refleja por sí sola qué está pendiente hoy**.

## Principios que siguen vigentes

### Configuración y secretos

- Mantener las claves privadas de proveedores exclusivamente en Secret Manager/backend.
- No versionar secretos, debug tokens ni archivos `.env` reales.
- Revisar restricciones de las claves web públicas y rotar/destruir secretos sólo mediante un procedimiento seguro.

### Proveedores, caché y mapas

- Mantener cuotas, validación, caché y expiración explícitas.
- Conservar separación entre datos canónicos del usuario y provider cache.
- Verificar atribuciones/términos de los proveedores y medir rendimiento real antes de hacer tuning especulativo.
- Mantener comportamiento degradado seguro cuando un proveedor o una caché auxiliar fallen.

### Firebase, datos y rollout

- Aislar datos por UID mediante Rules y contratos de dominio.
- Mantener recovery/backups/observabilidad y validar cualquier cambio por entorno.
- App Check se observa antes de enforcement.
- READ, migración, WRITE y retiro de v3 se habilitan únicamente en sus gates productivos correspondientes.
- No usar `atlasmap-prod` como backend de desarrollo.

### Privacidad y calidad

- Mantener minimización, aislamiento y borrado de datos de usuario.
- Mantener verdes tests, Rules, lint, build y los workflows de seguridad/dependencias.
- Validar experiencia real en navegadores/dispositivos soportados y accesibilidad del producto.

## Nota sobre casillas históricas

Las antiguas casillas de esta checklist fueron retiradas deliberadamente porque mezclaban trabajo ya completado con trabajo todavía condicionado por Phase L. Su presencia provocaba falsos pendientes (por ejemplo TTL, recovery o creación de infraestructura que ya podía tener evidencia posterior). El roadmap A–L y sus closeouts son ahora el mecanismo canónico para determinar readiness.
