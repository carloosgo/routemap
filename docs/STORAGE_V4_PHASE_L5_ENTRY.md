# Atlas Storage v4 — Phase L5 materialización/verificación

Fecha: **2026-08-14**

Target:

```text
project: atlasmap-prod
Firestore: (default)
location: us-central1
canonical source durante L5: v3
```

L5 materializa una muestra productiva v3→v4 para verificar equivalencia estructural y operacional. **No convierte v4 en canónico, no habilita WRITE v4 global y no elimina v3.**

## Prerrequisitos duros

- L2 recovery/costo PASS.
- L4 READ estable para la cohorte objetivo y rollback comprobado.
- Rules/telemetría necesarias para verificar v4 sin abrir WRITE directo de cliente.
- selección explícita y acotada de viajes; no existe tamaño default.
- cada viaje debe tener preflight individual antes de cualquier materialización.

## Contrato por viaje

La vía de dev ya estableció el patrón de seguridad que L5 productivo debe conservar:

1. leer fuente v3 persistida;
2. materializar en memoria al contrato v4;
3. calcular digest SHA-256 del resultado esperado;
4. emitir preflight sin mutaciones;
5. exigir el mismo digest al aplicar;
6. abortar si la fuente cambió entre preflight y apply;
7. exigir resultado `complete` y versión esperada;
8. aceptar replay únicamente si es idempotente;
9. verificar nuevamente estructura/conteos/digest.

No se reutiliza un runner dev contra producción. El runner productivo, cuando se implemente, debe hardcodear `atlasmap-prod`, tener token de confirmación propio y ser incapaz de operar sobre dev por accidente.

## Estado canónico durante L5

```text
v3 = canónico
v4 = materialización verificada / sombra
```

Una materialización v4 exitosa no cambia por sí sola el repositorio elegido por el usuario ni habilita dual-write.

## Verificación mínima

Por cada viaje materializado comprobar:

- schemaVersion v4 esperado;
- root summary consistente con la fuente;
- conteos de `segments`, `places`, `connections`, `notes`, `checklist`;
- digest igual al aprobado en preflight;
- ausencia de entidades inesperadas;
- ausencia de cambios en la fuente v3 causados por la verificación;
- replay idempotente cuando se ejecute deliberadamente;
- lectura híbrida consistente con el viaje v3 original.

## Delete y restore

L5 no modifica la semántica de eliminación definida para Atlas:

- un viaje eliminado por el usuario sigue siendo definitivo para el usuario;
- no se introduce UI ni API pública/backend para restaurar un viaje completo;
- recovery de infraestructura/backup es un mecanismo operacional distinto;
- una materialización sombra no puede revivir un viaje que el lifecycle considere eliminado.

## Stop conditions

Detener L5 ante:

- digest distinto entre preflight y apply;
- diferencia de conteos o shape;
- overwrite inesperado de estado v4 existente;
- mutación de la fuente v3;
- cambio de comportamiento visible/canónico no autorizado;
- verificación parcial o silenciosamente omitida;
- cualquier bypass de ownership/aislamiento.

## Planner seguro

```bash
npm run phase-l:l5:materialization-plan-prod -- --trip-count=<cantidad>
```

Es **plan-only** y exige tamaño de muestra explícito. No admite `--apply`, no toca cloud, no selecciona UIDs/trip IDs y no materializa nada.

## Gate de salida L5

L5 puede cerrarse cuando una muestra productiva aprobada complete preflight→materialización→verificación con equivalencia PASS y sin cambiar la fuente canónica. El paso a L6 es independiente: habilitar WRITE v4 exige su propia infraestructura, Rules, Functions, cohortes y kill-switch.
