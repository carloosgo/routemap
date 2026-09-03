# Atlas — planificación de viajes

Atlas es una aplicación web para planear viajes internacionales: itinerarios por ciudad, lugares guardados, conexiones, gastos, notas, checklist y visualización cartográfica. El frontend usa React + Vite y la persistencia autenticada usa **Atlas Storage v4-only**.

## Stack actual

- React 18 + Vite.
- Firebase Authentication, Firestore y Cloud Functions.
- Storage v4 con persistencia física por entidad, versionado, lifecycle y sincronización local-first.
- repositorio local para viajes de usuarios no autenticados;
- IndexedDB/mutation queue para trabajo durable y sync autenticado;
- Google Maps como renderer cartográfico principal;
- Google Places/Routes y Geoapify según el contrato de cada dominio;
- cachés de proveedor separadas del dato canónico del usuario.

Remote Config puede existir como capacidad de plataforma para otros usos, pero **no selecciona la generación de storage**. Gate G, pilot, hybrid read, dual-write y fallback v3 son historia de implementación y no forman parte del runtime soportado.

## Requisitos

- Node.js 22.x.
- npm.
- Firebase CLI para tests de Rules y tareas operativas que lo requieran.
- gcloud autenticado únicamente para los inventarios cloud read-only que lo requieran.

## Desarrollo local

```bash
npm install
cp .env.example .env.local
npm run dev
```

El servidor de Vite abre normalmente en `http://localhost:5173`.

Las variables `VITE_*` son configuración pública del cliente. Las claves privadas de proveedores usadas por Functions viven en Firebase Secret Manager y nunca deben copiarse a `.env.local` ni versionarse.

## Validación local

```bash
npm run verify:local
```

Los cambios que afectan Firestore también requieren los tests de Rules correspondientes. En CI, el corte final debe obtener Quality, CodeQL y Dependency Audit verdes sobre el mismo SHA antes de considerarse certificado.

## Persistencia de viajes

La selección actual es deliberadamente simple:

```text
sin usuario autenticado -> repositorio local
usuario autenticado     -> Firestore Storage v4
```

No existe selector v3/v4 ni backend REST alternativo para viajes.

Storage v4 presenta un `Trip` lógico completo a la aplicación, pero Firestore persiste entidades independientes:

```text
users/{uid}/trips/{tripId}
  segments/{segmentId}
  places/{placeId}
  connections/{connectionId}
  notes/{noteId}
  checklist/{itemId}
```

El root conserva identidad, resumen, moneda, `origin`, lifecycle/versionado y agregados derivados. Los datos temporales/calculados de proveedores no se convierten en dato canónico del usuario.

## Entornos

```text
local/emulators -> iteración y pruebas deterministas
atlasmap-dev    -> integración cloud / preproducción real
atlasmap-prod   -> producción protegida
```

- `.firebaserc` mantiene `default` y `dev` en `atlasmap-dev`.
- `prod` apunta exclusivamente a `atlasmap-prod`.
- un `git push` no despliega automáticamente Firebase.
- `atlasmap-prod` nunca se usa como backend de desarrollo.

### Verificación de preprod

```bash
npm run storage-v4:dev:verify
npm run storage-v4:dev:preprod-parity
npm run storage-v4:dev:platform-parity
```

Estos inventarios son read-only. El stage canónico espera tres Functions v4, seis triggers Eventarc y Rules activas idénticas a `firestore.rules`.

## Producción

La futura salida productiva es un **release directo v4**. No existe una fase futura donde debamos volver a crear v3, cohortes, hybrid read o dual-write.

Si aparece estado legacy inesperado en `atlasmap-prod`, el release se detiene y se inventaría; no se reintroduce una segunda arquitectura como parche.

## Documentación principal

- `ARCHITECTURE.md` — arquitectura de aplicación y fronteras vigentes.
- `SECURITY.md` — controles de seguridad.
- `docs/FIREBASE_FOUNDATION.md` — estado canónico de Firebase y Storage v4.
- `docs/FIRESTORE_TRIP_STORAGE.md` — contrato físico de persistencia.
- `docs/STORAGE_ARCHITECTURE_V4.md` — diseño completo; sus secciones de transición son históricas.
- `docs/STORAGE_V4_IMPLEMENTATION_STATUS.md` — estado vigente de implementación/entornos.
- `docs/STORAGE_V4_OPERATIONS_RUNBOOK.md` — operación v4 actual.
- `docs/STORAGE_V4_PRODUCTION_ROLLOUT.md` — release productivo directo v4.
- `docs/CITY_CATALOG_ARCHITECTURE.md` — catálogo global de ciudades.
- `docs/PROVIDER_CACHE_TOPOLOGY.md` — topología de cachés.

Los documentos fechados de Gate G, pilot y antiguas fases A–L se conservan como evidencia histórica cuando corresponde, no como procedimientos operativos actuales.

## Principio de evolución

Una nueva funcionalidad debe integrarse al modelo v4 existente sin crear caminos paralelos por conveniencia. La UI no conoce generaciones de storage; el mapa renderiza; los datos de usuario siguen siendo canónicos y los proveedores/cachés permanecen derivados y reemplazables.
