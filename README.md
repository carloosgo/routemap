# Atlas — planificación de viajes

Atlas es una aplicación web para planear viajes internacionales: itinerarios por ciudad, lugares guardados, conexiones, gastos, notas, checklist y visualización cartográfica. El frontend usa React + Vite y la persistencia autenticada se apoya en Firebase mediante la arquitectura **Atlas Storage v4** y su rollout controlado.

## Stack actual

- React 18 + Vite.
- Firebase Authentication, Firestore, Cloud Functions y Remote Config.
- Atlas Storage v4 con Gate G para transición controlada entre v3, lectura híbrida y v4.
- `localStorage` únicamente para viajes locales de usuarios no autenticados y su importación posterior.
- El entry path cartográfico principal (`AppMapPane -> RouteMap`) usa Google Maps; Google Places/Routes atienden los flujos que les corresponden.
- Geoapify para autocompletado de ciudades y funciones auxiliares de proveedor.
- Permanecen módulos históricos/auxiliares MapLibre + PMTiles en el árbol, pero este documento no los declara parte del runtime principal sin un consumidor verificado.
- Cachés de proveedor separadas de los datos canónicos: caché ligera en navegador y caché compartida server-side con TTL.

## Requisitos

- Node.js 22.x.
- npm.
- Firebase CLI para pruebas de Rules y tareas operativas que lo requieren.

## Desarrollo local

```bash
npm install
cp .env.example .env.local
npm run dev
```

El servidor de Vite abre normalmente en `http://localhost:5173`.

Las variables `VITE_*` son configuración pública del cliente. Las claves privadas de proveedores usadas por Functions viven en Firebase Secret Manager y no deben copiarse a `.env.local`.

## Validación

Antes de integrar cambios:

```bash
npm test
npm run lint
npm run build
```

Cuando el cambio afecta Firestore/Storage v4 también se ejecutan los contratos correspondientes, incluido `npm run test:rules`. El workflow `Quality checks` ejecuta unit tests, Rules, Phase-K E2E Rules, ESLint y build en pull requests.

## Persistencia de viajes

El selector activo vive en `src/modules/trips/tripRepositorySelector.js`:

```text
sin usuario autenticado -> localStorageRepository
usuario autenticado     -> Gate G -> v3 | hybrid-read | v4-pilot
```

No existe un backend REST seleccionable mediante `VITE_STORAGE_DRIVER`. La transición v3/v4 es deliberada y permanece hasta que los gates productivos de convergencia permitan retirar v3.

Storage v4 separa el documento raíz del viaje de sus entidades (`segments`, `places`, `connections`, `notes` y `checklist`) y mantiene los datos temporales/derivados de proveedores fuera del modelo canónico del usuario.

## Entornos

La estrategia operativa se documenta en los closeouts y snapshots de Storage v4. Como principio:

```text
local/emulators -> iteración rápida
atlasmap-dev    -> integración cloud / preproducción
atlasmap-prod   -> rollout productivo controlado por gates
```

No se debe usar `atlasmap-prod` como backend de desarrollo ni inferir estado cloud sólo porque exista un runner en el repositorio.

## Documentación principal

- `ARCHITECTURE.md` — arquitectura de aplicación y fronteras principales.
- `SECURITY.md` — controles de seguridad vigentes.
- `docs/STORAGE_ARCHITECTURE_V4.md` — contrato y diseño de Atlas Storage v4.
- `docs/STORAGE_V4_IMPLEMENTATION_STATUS.md` — estado de implementación por fases.
- `docs/STORAGE_V4_OPERATING_STATE_2026-08-15.md` — snapshot operativo histórico; los closeouts/evidencia cloud posteriores tienen prioridad.
- `docs/STORAGE_V4_PHASE_J_DECISION_2026-08-14.md` — decisión canónica sobre separación de provider cache para v4.0.
- `docs/PROVIDER_CACHE_TOPOLOGY.md` — topología de caché y checkpoint futuro para separación física.

## Principio de evolución

Atlas evita reemplazos masivos sin evidencia. Las piezas de rollout, rollback y compatibilidad se retiran únicamente cuando el gate correspondiente lo autoriza; las optimizaciones de rendimiento se hacen con medición y no por especulación.
