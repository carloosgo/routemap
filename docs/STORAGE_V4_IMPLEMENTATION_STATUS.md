# Atlas Storage v4 — implementation status

Fecha de revisión: **2026-09-03**

## Estado ejecutivo

La implementación soportada de Atlas es **Storage v4-only**. Las fases históricas de coexistencia, Gate G, pilot, rollback a v3, materialización v3→v4 y convergencia ya no representan trabajo pendiente ni caminos operativos disponibles.

El trabajo que queda antes de abrir producción es **preparación y liberación de infraestructura v4**, no una migración de generación de storage.

## Arquitectura implementada

| Área | Estado actual |
|---|---|
| Schema y Rules v4 | Implementado y cubierto por tests |
| Persistencia local / IndexedDB | Implementada |
| Dirty tracking / mutation intents | Implementado |
| Sync Coordinator / retry / lease | Implementado y probado |
| Persistencia incremental por entidad | Implementada |
| Agregados backend-owned | Implementados |
| Lifecycle / delete / purge | Implementado y probado |
| Conflictos / versionado | Implementado y probado |
| Separación de provider cache | Implementada según contrato v4 |
| Recovery / observabilidad / carga dev | Evidencia histórica Phase K cerrada |
| Runtime autenticado | **v4-only** |
| Runtime sin sesión | Repositorio local |
| v3 / hybrid / dual-write / Gate G | **Retirados** |

## Modelo físico canónico

```text
users/{uid}/trips/{tripId}
  segments/{segmentId}
  places/{placeId}
  connections/{connectionId}
  notes/{noteId}
  checklist/{itemId}
```

El root conserva resumen, identidad, moneda, `origin`, lifecycle/versionado y agregados derivados. No existen `activeRevision` ni `revisions/{revisionId}` en el contrato operativo.

## Entornos

### Local

- código de trabajo de la rama certificada;
- Vite;
- persistencia local/IndexedDB;
- emuladores Firebase cuando se necesita aislamiento;
- puede operar sin tocar cloud real.

### Preprod — `atlasmap-dev`

Es el único entorno cloud de integración y preproducción.

Contrato esperado actual:

- Firestore real v4;
- 3 Functions v4;
- 6 triggers Eventarc;
- Rules canónicas v4;
- Auth real;
- recovery/observabilidad/costos dev;
- Hosting/App Check/TTL según el inventario físico vigente.

Verificación read-only canónica:

```powershell
npm run storage-v4:dev:verify
npm run storage-v4:dev:preprod-parity
npm run storage-v4:dev:platform-parity
```

La evidencia Phase K de agosto confirma que las principales capacidades cloud fueron ejercitadas. Para afirmar el estado físico actual de `atlasmap-dev` se debe ejecutar el verificador contra el proyecto autenticado; los documentos históricos no sustituyen esa lectura.

### Producción — `atlasmap-prod`

Producción es un proyecto separado y protegido. La última evidencia histórica documentada confirma que se creó el proyecto, Firebase/Firestore, Web App/Google Auth y controles de recovery/costo iniciales en fases anteriores. No se utiliza como backend de desarrollo.

La liberación futura será **directamente v4**. Antes de abrir tráfico se debe inventariar de nuevo el estado remoto y completar los gates vigentes de recovery, plataforma/App Check y despliegue coherente descritos en `STORAGE_V4_PRODUCTION_ROLLOUT.md`.

## Qué ya no forma parte del plan

No son pendientes ni opciones de recuperación:

- activar READ v4 por cohortes;
- mantener v3 canónico mientras se materializa v4;
- habilitar WRITE v4 por porcentaje;
- converger de v3 a v4 en producción;
- retirar v3 en un gate posterior;
- utilizar Remote Config para seleccionar la generación de storage.

Los planners ejecutables que modelaban esas fases se retiraron del repositorio activo.

## Evidencia histórica

Los closeouts fechados de agosto de 2026 conservan pruebas útiles de:

- migración/rollback/remigración que se usó durante la construcción;
- restore drills;
- carga y reconexión;
- observabilidad y alertas;
- budgets;
- seguridad productiva inicial.

Esos documentos son evidencia de implementación, no instrucciones para reactivar mecanismos retirados.

## Estado de producción a partir de ahora

No se expresa el avance como “porcentaje de migración v4”, porque esa migración ya dejó de existir en el runtime soportado. El criterio pendiente es operacional:

1. inventario read-only actual de `atlasmap-prod`;
2. recovery/budget/observabilidad confirmados;
3. Hosting/dominio/App Check listos;
4. candidato v4 completo certificado sobre un mismo SHA;
5. despliegue explícito por superficies;
6. verificación server-side y smokes;
7. apertura de tráfico.

Si aparece un dato o dependencia legacy inesperada en producción, se detiene el release y se inventaría. No se crea un segundo camino de storage para absorberlo.

## Criterio de rama certificada

Un HEAD solo se considera entregable cuando, sobre el mismo SHA, pasan:

- Quality Checks;
- tests/contratos;
- Firestore Rules emulator tests;
- ESLint;
- build de producción;
- CodeQL;
- Dependency Audit.

La certificación del código no equivale a un deploy cloud.
