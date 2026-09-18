# Atlas Storage v4 — Development steady state

Fecha de revisión: **2026-09-03**

## Estado canónico

Atlas opera con una sola arquitectura de persistencia autenticada: **Storage v4-only**.

```text
local/emulators -> iteración rápida y pruebas deterministas
atlasmap-dev    -> integración cloud y preproducción real
atlasmap-prod   -> producción protegida; no se usa para desarrollo
```

Los mecanismos históricos de selección de generación de storage —Gate G, pilot, cohortes, kill switch de versión, hybrid read, dual-write y fallback v3— no forman parte del steady state actual y no deben reintroducirse.

## atlasmap-dev

`atlasmap-dev` es el único backend cloud para desarrollo e integración real. El contrato esperado es:

- Firestore v4 canónico;
- tres Cloud Functions v4: `v4FirestoreEventIngress`, `v4TripLifecycle`, `v4TripPurge`;
- seis triggers Eventarc: root del viaje más las cinco colecciones hijas;
- `firestore.rules` como Rules canónicas;
- persistencia local-first, IndexedDB y mutation queue;
- observabilidad, recovery y controles de costo de dev independientes de producción.

La evidencia cloud histórica de Phase K demuestra que estas clases de infraestructura fueron probadas en dev. El estado físico actual debe comprobarse con el verificador read-only antes de depender de él; un documento histórico no sustituye una lectura actual del proyecto.

## Verificación canónica

Para comprobar el stage v4 real de desarrollo:

```powershell
npm run storage-v4:dev:verify
```

Ese comando es read-only y debe:

- fijar el target exactamente en `atlasmap-dev`;
- comprobar las tres Functions v4 y sus regiones;
- comprobar los seis triggers Eventarc y su wiring;
- comprobar que el Ruleset activo coincide exactamente con `firestore.rules`;
- declarar que producción queda fuera de alcance;
- no aceptar `--apply` ni mutar datos, IAM o infraestructura.

Para una revisión más amplia del steady state:

```powershell
npm run storage-v4:dev:steady-state
```

Este runner compone el stage verify canónico con los controles read-only de Phase K que sigan vigentes. No selecciona v3/v4 y no depende de Remote Config.

## Regla de desarrollo

Todo cambio nuevo sigue esta secuencia:

1. pruebas locales y emuladores;
2. certificación del código en CI;
3. integración contra `atlasmap-dev` únicamente cuando haga falta infraestructura real;
4. verificación read-only del stage después de cualquier mutación cloud autorizada;
5. producción permanece aislada hasta una decisión explícita de release.

Una mutación en `atlasmap-dev` sigue requiriendo el mecanismo de confirmación del runner correspondiente. Un cambio de código, un `git push` o la palabra “continúa” no autorizan por sí mismos un deploy cloud.

## Producción

`atlasmap-prod` no es backend de pruebas. Cualquier futura salida a producción será una liberación **directa sobre Storage v4**, no una reactivación del rollout v3→v4.

Si un inventario productivo encontrara datos o dependencias inesperadas de una generación anterior, la acción correcta es **detener el release e inventariar**, no reintroducir hybrid read, dual-write, cohortes o fallback v3.

## Documentación histórica

Los closeouts y documentos fechados de agosto de 2026 pueden conservar referencias a Gate G, pilot, Remote Config o migraciones v3→v4 como evidencia de cómo se llegó a v4. Esas referencias son históricas y no constituyen procedimientos operativos vigentes.
