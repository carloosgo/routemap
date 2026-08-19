# Testing strategy

## Objetivo

La suite debe proteger contratos de producto y arquitectura sin quedar acoplada a detalles accidentales de implementación. Un cambio funcional correcto no debe fallar solo porque una función cambió de archivo, una llamada se reescribió de forma equivalente o el JSX/CSS se reorganizó.

## Taxonomía

### A. Behavior — bloqueante
Prueba resultados observables o invariantes de dominio mediante APIs públicas. Debe sobrevivir refactors internos. Ubicación objetivo: `test/behavior/`.

### B. Architecture — bloqueante y deliberada
Protege una decisión estructural que queremos impedir que se degrade. Puede inspeccionar source cuando ese acoplamiento es intencional. Ubicación objetivo: `test/architecture/`. Durante la migración, nombres como `*Boundaries`, `*Wiring`, `*Contract`, `*Security`, `*Preflight`, `*Deploy`, `*Rules` o `*Telemetry` también se reconocen como guardrails arquitectónicos cuando inspeccionan source.

### C. Legacy static — deuda visible
Inspecciona strings, regex, nombres de archivos, JSX/CSS literal u orden interno sin que ese detalle sea por sí mismo el contrato del producto. Ubicación objetivo: `test/legacy-static/`. Debe convertirse en behavior/architecture o eliminarse si el contrato ya no existe.

### D. Obsolete candidate — revisión requerida
Test que referencia una funcionalidad/archivo inexistente sin que la ausencia sea precisamente lo que el test verifica. El auditor entiende `assert.rejects(read(...))` como una comprobación intencional de ausencia.

### Integration — bloqueante
Pruebas que requieren límites reales de infraestructura, como Firestore Rules o emuladores. El inventario incluye tanto `*.test.*` como `*.spec.*`; `firebase-tests/` y `*.emulator.spec.*` se clasifican explícitamente como integración. Su ejecución puede seguir en comandos CI dedicados en vez de `npm test`.

## Regla para cualquier cambio funcional

Antes de cerrar una feature o refactor se revisa el delta de contrato:

1. ¿Cambió comportamiento observable?
2. ¿Cambió un contrato de dominio?
3. ¿Cambió un guardrail arquitectónico intencional?
4. ¿Qué tests dependen de los archivos modificados?

`npm run test:impact` responde el punto 4 leyendo imports y referencias estáticas directas. Es una ayuda de impacto, no sustituye el criterio de cobertura. Si aparece un `legacy-static`, debe revisarse dentro del mismo cambio para confirmar si sigue siendo válido, debe convertirse o debe eliminarse.

No se adapta producción para satisfacer una representación interna obsoleta.

## Regla para nuevos tests

- Preferir funciones/exportaciones públicas y resultados.
- No leer source para demostrar comportamiento.
- Un test que lee source y debe bloquear CI tiene que ser arquitectura deliberada.
- No agregar nuevos contratos `legacy-static`.
- Fixtures deben representar datos válidos y realistas.

## Flujo local antes de push

```text
npm run test:impact → npm run test:contracts → npm test → npm run lint → npm run build → push
```

El atajo oficial es:

```text
npm run verify:local
```

Esto verifica compilación; no despliega ningún ambiente.

## Línea base de deuda

`test/legacy-static-baseline.json` contiene únicamente la deuda C existente que todavía debe migrarse. La regla es monotónica:

- un archivo de la baseline puede desaparecer de C al convertirse en behavior/architecture o eliminarse si su contrato ya no existe;
- CI no permite agregar una ruta `legacy-static` nueva;
- un `obsolete-candidate` bloquea hasta que se revise;
- no se aumenta la baseline para “hacer verde” una feature.

`npm run test:contracts` aplica esa regla. La baseline no hace no-bloqueantes a las pruebas heredadas: todas siguen ejecutándose en sus comandos correspondientes mientras se migran.

## Auditoría

`npm run test:audit` recorre archivos `*.test.*` y `*.spec.*` y clasifica cada uno. En CI se conserva `test-audit.json` como artefacto. La clasificación automática es una señal para revisión, no autorización para borrar una prueba.

## Migración

1. Clasificar e instrumentar toda la suite.
2. Migrar primero los tests que ya generaron falsos bloqueos.
3. Separar archivos mixtos: behavior por un lado, wiring/arquitectura por otro.
4. Convertir C a A/B o eliminarlo si el contrato ya no existe.
5. Reducir la línea base de C de forma monotónica y no permitir deuda nueva.
