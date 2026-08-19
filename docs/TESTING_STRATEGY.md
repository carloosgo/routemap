# Testing strategy

## Objetivo

La suite debe proteger contratos de producto y arquitectura sin quedar acoplada a detalles accidentales de implementación. Un cambio funcional correcto no debe fallar solo porque una función cambió de archivo, una llamada se reescribió de forma equivalente o el JSX/CSS se reorganizó.

## Taxonomía

### A. Behavior — bloqueante

Prueba resultados observables o invariantes de dominio mediante APIs públicas. Debe sobrevivir refactors internos.

Ubicación objetivo: `test/behavior/`.

Ejemplos: continuidad de segmentos, normalización, reordenamiento, persistencia observable.

### B. Architecture — bloqueante y deliberada

Protege una decisión estructural que queremos impedir que se degrade. Puede inspeccionar source, pero solo cuando ese acoplamiento es intencional y está documentado.

Ubicación objetivo: `test/architecture/`.

Ejemplos: límites de tamaño de fachadas, separación de módulos, obligación de pasar por un serializer o gateway.

### C. Legacy static — deuda visible

Inspecciona strings, regex, nombres de archivos, JSX/CSS literal u orden interno sin que ese detalle sea por sí mismo el contrato del producto. Es candidato a convertirse en behavior/architecture o a eliminarse.

Ubicación objetivo: `test/legacy-static/`.

Estos tests no se borran automáticamente. Primero se clasifica qué intención protegían y después se reemplazan por un contrato estable.

### D. Obsolete candidate — revisión requerida

Test que referencia una funcionalidad/archivo inexistente o cuyo contrato fue reemplazado explícitamente. No se actualiza “hasta que pase”: se decide si debe eliminarse o reescribirse.

## Regla para cualquier cambio funcional

Antes de cerrar una feature o refactor se debe declarar mentalmente el delta de contrato:

1. ¿Cambió comportamiento observable?
2. ¿Cambió un contrato de dominio?
3. ¿Cambió un guardrail arquitectónico intencional?
4. ¿Hay pruebas que describen el comportamiento anterior?

Si la respuesta a 1–3 es sí, los tests correspondientes se actualizan en el mismo cambio. Si un test falla solo por una representación interna, se reclasifica en vez de adaptar producción para satisfacerlo.

## Regla para nuevos tests

- Preferir funciones/exportaciones públicas y resultados.
- No leer source para demostrar comportamiento.
- Un test que lee source y debe bloquear CI tiene que ser explícitamente `architecture`.
- No agregar nuevos contratos `legacy-static`.
- Fixtures deben representar datos válidos y realistas para la invariantes que se comprueba.

## Flujo local antes de push

```text
npm test → npm run lint → npm run build → push
```

El atajo oficial es:

```text
npm run verify:local
```

Esto verifica compilación; no despliega ningún ambiente.

## Auditoría

`npm run test:audit` recorre la suite y clasifica cada archivo. Las heurísticas detectan inspección estática de source y referencias estáticas inexistentes. Una clasificación automática es una señal para revisión, no autorización para borrar una prueba.

En CI se conserva `test-audit.json` como artefacto para poder localizar deuda de pruebas sin esperar a que una prueba obsoleta falle durante otra feature.

## Migración

1. Clasificar e instrumentar toda la suite.
2. Migrar primero los tests que ya generaron falsos bloqueos.
3. Separar archivos mixtos: behavior por un lado, wiring/arquitectura por otro.
4. Convertir C a A/B o eliminarlo si el contrato ya no existe.
5. Una vez establecida la línea base, C/D pasa a revisión explícita y no se permite deuda nueva.
