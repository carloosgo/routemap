# Arquitectura de Atlas

## Principio rector

Atlas separa presentación, lógica de dominio, persistencia y proveedores mediante contratos explícitos. Las transiciones de infraestructura se hacen detrás de selectors/gates para que la UI no tenga que conocer qué generación de almacenamiento está atendiendo una operación.

La documentación detallada de Storage v4 vive en `docs/STORAGE_ARCHITECTURE_V4.md`; este archivo describe cómo encaja dentro de la aplicación.

## Capas principales

```text
src/
├── app/                       composición de la aplicación
├── components/                UI reutilizable
├── infrastructure/firebase/   Firebase Web SDK, Gate G y adapters cloud
├── modules/
│   ├── trips/                 modelo, estado y selector de persistencia
│   ├── storage/               persistencia local activa para viajes anónimos
│   ├── storage-v4/            IndexedDB, mutations, sync y contratos v4
│   ├── geocoding/             búsqueda/autocompletado de ciudades
│   ├── places/                búsqueda, detalle y enriquecimiento de lugares
│   ├── routes/                rutas/estimaciones de conexiones
│   ├── map/                   render y capas cartográficas
│   └── expenses/              dominio de gastos
└── shared/                    utilidades comunes

functions/                     callables, eventos v4 y acceso a proveedores
scripts/                       runners operativos protegidos por gates
firebase-tests/                contratos de Firestore Rules
```

## Persistencia de viajes

El único punto de selección para la UI de viajes es `src/modules/trips/tripRepositorySelector.js`.

```text
usuario no autenticado
    -> localStorageRepository

usuario autenticado
    -> Gate G
       -> v3
       -> hybrid-read
       -> v4-pilot
```

La coexistencia v3/hybrid/v4 **no es duplicación accidental**. Forma parte del rollout y rollback de Atlas Storage v4 y se conserva hasta el gate de convergencia/retiro correspondiente.

El antiguo selector `local|api` y el blueprint REST fueron retirados: no forman parte de la arquitectura actual.

## Atlas Storage v4

El modelo canónico distribuye un viaje en:

```text
users/{userId}/trips/{tripId}
  segments/{segmentId}
  places/{placeId}
  connections/{connectionId}
  notes/{noteId}
  checklist/{itemId}
```

El root del viaje contiene estado agregado/administrativo; las entidades mantienen versionado y contratos propios. Geometrías, respuestas de proveedores y otros datos temporales/calculados no se convierten en datos canónicos del usuario.

El cliente v4 incluye persistencia IndexedDB, dirty tracking, mutation queue, coordinación de sync, control de concurrencia y mecanismos de recovery. Su activación productiva está gobernada por Gate G/Remote Config y por los gates de Phase L; que una pieza no esté activada globalmente no significa que no esté implementada.

## Proveedores y cachés

Atlas usa proveedores distintos según el caso de uso:

- Geoapify: descubrimiento/revalidación de ciudades y funciones auxiliares/enriquecimiento.
- Google Places: búsqueda/detalle/localización de lugares en los flujos activos correspondientes.
- Google Routes y Geoapify routing: rutas/estimaciones según el flujo y modo.

Existen dos niveles de caché de proveedor con responsabilidades diferentes:

1. **Browser cache**: best-effort, acotada y descartable. Evita llamadas repetidas incluso a nuestras Functions cuando un usuario reutiliza el mismo dato.
2. **Shared server cache**: Firestore vía `cacheDb`, con `expiresAt`, deduplicación de cargas en vuelo y comportamiento fail-soft. Evita repetir llamadas de proveedor entre usuarios/instancias.

Los datos de usuario y la caché de proveedor nunca comparten semántica aunque durante v4.0 la separación física de Firestore permanezca diferida. La decisión canónica está en `docs/STORAGE_V4_PHASE_J_DECISION_2026-08-14.md`.

## Catálogo canónico de ciudades

Las ciudades globales de referencia tienen una semántica distinta tanto de los datos de usuario como de la caché temporal de proveedor.

Atlas mantiene un catálogo server-only progresivo:

```text
cityCatalog/{atlasCityId}
cityCatalogProviderRefs/{providerRefHash}
cityCatalogQueries/{queryFingerprint}
```

`geoapifyCityAutocomplete` consulta primero una proyección de búsqueda Atlas. Un hit fresco devuelve snapshots de ciudades Atlas sin consumir Geoapify. Un miss o proyección vencida usa Geoapify como proveedor de descubrimiento/revalidación, normaliza la respuesta, materializa/actualiza el catálogo y refresca la proyección.

Los IDs del catálogo son opacos y propios de Atlas; la identidad de proveedor se conserva fuera de los viajes en `cityCatalogProviderRefs`. Los segmentos siguen persistiendo un snapshot City autosuficiente con el contrato v4 existente (`id`, nombres, país, ISO y coordenadas). Esto permite que viajes históricos con IDs de proveedor sigan siendo válidos sin una reescritura destructiva.

El catálogo no usa `expiresAt`: es referencia durable. Sus proyecciones tienen `verifiedAt/revalidateAfter` y pueden servir un snapshot stale únicamente como fallback si falla el proveedor durante una revalidación. La implementación, compatibilidad, seguridad y referencias internacionales están documentadas en `docs/CITY_CATALOG_ARCHITECTURE.md`.

## Mapas

El entry path principal es:

```text
App -> AppMapPane -> RouteMap -> GooglePlacesMap
```

El lienzo de mapas de Atlas usa Google Maps. La implementación histórica `ItineraryRouteMap` basada en MapLibre, junto con la integración Overture/PMTiles usada para polígonos de países, fue retirada después de verificar que no tenía consumidores, fallback ni entry point alternativo. La lógica de dominio reutilizable para rutas y países permanece separada del motor cartográfico y sigue siendo consumida por el renderer Google cuando corresponde.

## Seguridad y backend

Firebase Authentication identifica al usuario. Firestore Rules implementan aislamiento/ownership y contratos de shapes/versionado. Cloud Functions encapsulan secretos de proveedor, cuotas, validación y acceso server-side. App Check se despliega de forma gradual: capacidad del cliente y observación preceden al enforcement.

Los secretos backend viven en Firebase Secret Manager. Las variables `VITE_*` son públicas por definición y deben restringirse mediante las capacidades del proveedor (por ejemplo HTTP referrers/API restrictions para claves web).

El catálogo geográfico es interno y no se expone a lecturas/escrituras Firestore directas del navegador. La UI accede a ciudades exclusivamente por el contrato callable de búsqueda.

## Rendimiento

Principios vigentes:

- debounce y cancelación en búsquedas;
- caché browser acotada para evitar requests redundantes;
- shared provider cache con TTL/freshness explícita;
- catálogo de referencia con proyecciones pequeñas para evitar llamadas repetidas de proveedor;
- sync incremental y mutation queue en Storage v4;
- code splitting/bundling administrado por Vite;
- tuning basado en métricas reales, especialmente en gates productivos L4/L6.

No se agregan índices, nuevas capas de caché ni abstracciones únicamente por una mejora teórica sin evidencia de carga/latencia. El catálogo de ciudades no es una tercera caché: es una entidad de referencia durable con identidad propia y política explícita de revalidación.

## Fuentes de verdad

Para decisiones de Storage v4, los documentos de decisión/closeout posteriores tienen prioridad sobre snapshots históricos. En particular:

- `docs/STORAGE_ARCHITECTURE_V4.md`
- `docs/STORAGE_V4_IMPLEMENTATION_STATUS.md`
- `docs/STORAGE_V4_PHASE_J_DECISION_2026-08-14.md`
- `docs/STORAGE_V4_PHASE_K_CLOSEOUT_2026-08-14.md`
- `docs/STORAGE_V4_PRODUCTION_ROLLOUT.md`
- `docs/CITY_CATALOG_ARCHITECTURE.md` para identidad/búsqueda global de ciudades

Un runner presente en el repo demuestra capacidad/preparación, no que la mutación cloud haya sido ejecutada.
