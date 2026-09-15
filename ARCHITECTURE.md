# Arquitectura de Atlas

Fecha de revisión: **2026-09-03**

## Principio rector

Atlas separa presentación, dominio, persistencia y proveedores mediante contratos explícitos. La UI no conoce generaciones de almacenamiento: la persistencia autenticada soportada es exclusivamente **Storage v4** y el uso sin sesión permanece local.

Gate G, pilot, hybrid read, dual-write, fallback v3 y selección de generación mediante Remote Config fueron mecanismos transitorios ya retirados. No deben reaparecer para resolver funcionalidades nuevas.

## Capas principales

```text
src/
├── app/                       composición de la aplicación
├── components/                UI reutilizable
├── infrastructure/firebase/   Firebase Web SDK y adapters cloud v4
├── modules/
│   ├── trips/                 modelo y estado de viajes
│   ├── storage/               persistencia local para uso sin sesión
│   ├── storage-v4/            IndexedDB, mutations, sync y contratos v4
│   ├── geocoding/             búsqueda/autocompletado de ciudades
│   ├── places/                búsqueda, detalle y enriquecimiento de lugares
│   ├── routes/                rutas/estimaciones de conexiones
│   ├── map/                   render y capas cartográficas
│   └── expenses/              dominio de gastos
└── shared/                    utilidades comunes

functions/                     callables, eventos v4 y acceso a proveedores
scripts/                       runners operativos explícitos por entorno
firebase-tests/                contratos de Firestore Rules
```

## Persistencia de viajes

La frontera para la aplicación es:

```text
usuario no autenticado -> repositorio local
usuario autenticado     -> repositorio Firestore v4
```

No existe un backend REST seleccionable ni un selector v3/v4.

La aplicación continúa manipulando un `Trip` lógico completo, mientras Firestore persiste entidades físicas independientes:

```text
users/{uid}/trips/{tripId}
  segments/{segmentId}
  places/{placeId}
  connections/{connectionId}
  notes/{noteId}
  checklist/{itemId}
```

El root del viaje conserva identidad, resumen, moneda, `origin`, lifecycle/versionado y agregados derivados. Las entidades hijas tienen identidad, orden, versionado y estado propios.

No existen `activeRevision` ni `revisions/{revisionId}` en el contrato operativo actual.

## Pipeline local-first

```text
UI
 -> estado local
 -> IndexedDB / persistencia durable
 -> mutation queue
 -> scheduler/coalescing
 -> intent v4
 -> Firestore
 -> confirmación/versionado
```

Principios:

- una pulsación de tecla no equivale a una escritura Firestore;
- se sincroniza por entidad afectada;
- los conflictos de versión son explícitos;
- no hay last-write-wins silencioso para dato canónico;
- fallos de telemetría/cache no pueden perder trabajo del usuario;
- cambios de sesión descartan respuestas asíncronas pertenecientes al usuario anterior.

## Backend v4

El manifest canónico es `functions/v4BackendManifest.js`.

Functions v4 soportadas:

- `v4FirestoreEventIngress`;
- `v4TripLifecycle`;
- `v4TripPurge`.

El stage actual espera seis triggers Eventarc: el root del viaje y las cinco colecciones hijas. Los handlers deben ser idempotentes porque los eventos pueden repetirse o llegar fuera de orden.

## Lifecycle y borrado

El delete visible para el usuario es definitivo. Internamente puede existir una transición lógica/tombstone antes del purge físico para hacer segura la sincronización y los reintentos.

No existe una API pública para restaurar un viaje completo eliminado.

## Proveedores y cachés

Atlas separa estrictamente datos del usuario de datos recalculables del proveedor.

- Geoapify: catálogo/descubrimiento y operaciones auxiliares conforme a su contrato.
- Google Places: lugares cuando el flujo activo lo requiera.
- Google Routes/Geoapify routing: rutas y estimaciones según el dominio.

Existen dos niveles de caché con semántica derivada:

1. **Browser cache**: acotada, best-effort y descartable.
2. **Shared server cache**: server-side, con freshness/TTL y comportamiento fail-soft.

Una caché nunca se convierte en fuente canónica del viaje. Routing, ETA, tráfico, geometría regenerable y payloads arbitrarios del proveedor pertenecen a capas derivadas.

## Catálogo canónico de ciudades

El catálogo de ciudades tiene identidad propia y es distinto de los viajes y de las caches temporales:

```text
cityCatalog/{atlasCityId}
cityCatalogProviderRefs/{providerRefHash}
cityCatalogQueries/{queryFingerprint}
```

Los segmentos persisten snapshots City autosuficientes conforme al contrato v4. Los IDs Atlas son opacos; la identidad del proveedor permanece separada del dato de viaje.

La arquitectura completa del catálogo está en `docs/CITY_CATALOG_ARCHITECTURE.md`.

## Mapas

Entry path principal:

```text
App -> AppMapPane -> RouteMap -> GooglePlacesMap
```

El mapa renderiza estado de dominio; no es dueño de la persistencia. La lógica de rutas/países reutilizable permanece separada del motor cartográfico.

## Seguridad

Firebase Authentication identifica al usuario. Firestore Rules modelan ownership, shapes, límites, versionado, timestamps y colecciones protegidas.

- el cliente no puede leer/escribir fuera de su UID;
- campos backend-owned no son autoridad del navegador;
- catálogo/caches internas no se exponen como Firestore público;
- claves privadas viven en Secret Manager/backend;
- variables `VITE_*` son públicas y deben restringirse en el proveedor;
- App Check se observa antes de enforcement.

## Entornos

```text
local/emulators -> desarrollo y pruebas deterministas
atlasmap-dev    -> integración/preproducción real
atlasmap-prod   -> producción protegida
```

`.firebaserc` fija `default` y `dev` en `atlasmap-dev`; `prod` apunta a `atlasmap-prod`.

El código fuente, el estado desplegado de preprod y el estado desplegado de producción son cosas distintas. Un commit o CI verde no demuestra qué versión está desplegada en Firebase.

## Verificación de dev

El verificador canónico read-only es:

```powershell
npm run storage-v4:dev:verify
```

Comprueba 3 Functions v4, 6 Eventarc y Rules activas idénticas a `firestore.rules`, siempre contra `atlasmap-dev` y sin tocar producción.

Los inventarios adicionales de paridad son:

```powershell
npm run storage-v4:dev:preprod-parity
npm run storage-v4:dev:platform-parity
```

## Producción

La liberación productiva será directa sobre v4. No existe un gate futuro para volver a activar coexistencia v3/v4.

Rollback significa volver a artefactos/configuración **compatibles con v4**, no volver a una generación anterior de persistencia.

Si `atlasmap-prod` contiene estado legacy inesperado, se detiene la liberación y se inventaría antes de decidir cualquier tratamiento.

## Rendimiento

Principios vigentes:

- debounce/cancelación en búsquedas;
- cache browser acotada;
- shared provider cache con freshness explícita;
- catálogo durable con proyecciones pequeñas;
- sync incremental y mutation queue;
- code splitting/bundling con Vite;
- tuning basado en mediciones reales.

No se añaden índices, caches o abstracciones solo por mejora teórica sin evidencia.

## Fuentes de verdad

Para operación actual:

- `docs/FIREBASE_FOUNDATION.md`;
- `docs/FIRESTORE_TRIP_STORAGE.md`;
- `docs/STORAGE_V4_IMPLEMENTATION_STATUS.md`;
- `docs/STORAGE_V4_OPERATIONS_RUNBOOK.md`;
- `docs/STORAGE_V4_PRODUCTION_ROLLOUT.md`;
- `docs/CITY_CATALOG_ARCHITECTURE.md`;
- `docs/PROVIDER_CACHE_TOPOLOGY.md`.

`docs/STORAGE_ARCHITECTURE_V4.md` conserva el diseño completo y razonamiento histórico. Sus secciones de migración/coexistencia no son instrucciones actuales.

Los closeouts fechados prueban pasos pasados; un runner presente prueba capacidad, no que una mutación cloud haya sido ejecutada.
