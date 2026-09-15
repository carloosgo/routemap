# Firebase Foundation — Atlas

## Estado operativo actual

- Proyecto Firebase de desarrollo: `atlasmap-dev`
- Plan: Blaze
- Authentication: Google
- Firestore: Standard, base `(default)`, región `northamerica-south1`
- Cloud Functions Gen 2: runtime Node.js 22; servicios v4 en `us-central1`
- Eventarc v4: región `northamerica-south1`
- Rama de trabajo: `agent/phase-3-firebase-foundation`
- Persistencia autenticada de viajes: **Storage v4-only**
- Persistencia sin sesión: repositorio local

Gate G, el repositorio híbrido, el selector v3/v4, las cohortes de Remote Config y la telemetría de rollout fueron mecanismos transitorios y ya no forman parte del runtime operativo.

## Principios de arquitectura

1. Desarrollo y producción usan proyectos Firebase distintos.
2. La configuración pública del Web SDK se carga desde variables públicas del entorno; cuentas de servicio, secretos y claves privadas nunca se incrustan en frontend.
3. Los viajes canónicos pertenecen al UID indicado por `users/{uid}/trips/{tripId}`.
4. El cliente no puede leer ni escribir fuera de su UID.
5. `firestore.rules` es la única fuente canónica de Rules de la aplicación y valida el contrato v4.
6. La UI trabaja local-first; una pulsación de tecla no equivale a una escritura Firestore.
7. El repositorio local permanece disponible para uso sin sesión y trabajo local; no es un fallback Firestore v3.
8. App Check se administra mediante la política común de callable Functions y su proceso explícito de enforcement/rollback.
9. Las Functions públicas usan cuotas, límites de instancias/concurrencia y cachés con expiración según su dominio.
10. Las claves privadas de proveedores viven únicamente del lado servidor/Secret Manager.
11. Trayectos y Lugares son dominios independientes aunque compartan el lienzo del mapa.
12. No se reintroducen caminos v2/v3, Gate G, hybrid-read ni dual-write para resolver cambios funcionales.

## Persistencia de viajes v4

El modelo lógico continúa presentando un `Trip` completo a la aplicación, pero Firestore persiste entidades físicas independientes:

```text
users/{uid}/trips/{tripId}
  segments/{segmentId}
  places/{placeId}
  connections/{connectionId}
  notes/{noteId}
  checklist/{itemId}
```

El root conserva resumen, identidad, moneda, `origin` estructurado, lifecycle/versionado y agregados derivados. Las entidades hijas tienen su propia identidad, `rank`, `version` y `status`.

No existen `activeRevision` ni `revisions/{revisionId}` en el contrato operativo v4.

El detalle físico y los invariantes de guardado están documentados en:

- `docs/FIRESTORE_TRIP_STORAGE.md`

`docs/STORAGE_ARCHITECTURE_V4.md` conserva el diseño y razonamiento de la transición. Sus secciones de migración, gates, Gate G/pilot y coexistencia v3/v4 deben leerse como **historia de implementación**, no como instrucciones para reactivar esos mecanismos.

## Cambio entre almacenamiento local y nube

- Sin sesión se usa el repositorio local.
- Con sesión se usa directamente el repositorio Firestore v4 bajo el UID autenticado.
- La importación de datos locales, cuando aplique, no convierte el runtime en dual-write.
- Las respuestas asíncronas pertenecientes a un contexto de sesión anterior deben descartarse al cambiar de usuario.

## Pipeline local-first y sincronización

El editor v4 conserva trabajo durable localmente y genera intents incrementales por entidad.

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

Los conflictos de versión se representan explícitamente. No se utiliza last-write-wins silencioso para el dato canónico del viaje.

Una falla de telemetría o cache nunca debe convertir en fallido un guardado de usuario que de otro modo puede conservarse.

## Backend v4

`functions/v4BackendManifest.js` es el manifest canónico de infraestructura v4.

Functions soportadas:

- `v4FirestoreEventIngress`
- `v4TripLifecycle`
- `v4TripPurge`

Regiones canónicas actuales:

```text
Functions: us-central1
Eventarc:  northamerica-south1
```

Eventarc mantiene seis triggers para cambios del root y de las cinco colecciones hijas. El ingress y los handlers deben ser idempotentes porque la entrega de eventos puede repetirse o llegar fuera de orden.

El lifecycle maneja la transición lógica del viaje; el purge físico ocurre posteriormente y debe ser reintentable/resumible.

## Verificación de infraestructura dev

`scripts/runStorageV4DevStageVerify.mjs` es el verificador read-only del stage v4 de desarrollo.

Comprueba, sin mutar nube:

- las tres Functions v4 esperadas y sus regiones;
- los seis triggers Eventarc y su wiring esperado;
- que el Ruleset Firestore activo corresponde exactamente al `firestore.rules` canónico local;
- que el proyecto objetivo es `atlasmap-dev` y producción queda fuera del alcance.

No depende de Remote Config, cohortes ni estado pilot.

## App Check

El frontend está preparado para reCAPTCHA Enterprise mediante su clave pública de sitio. Las callable Functions obtienen la política común de App Check desde `callablePolicy.js`; el conjunto canónico de endpoints está definido por `callableManifest.js`.

El enforcement se cambia mediante el procedimiento explícito y auditable del proyecto. No se debe alterar individualmente una Function como parche salvo que exista una excepción de arquitectura deliberada y probada.

Los runners de enforcement/rollback deben:

- permanecer limitados al proyecto autorizado;
- comprobar inventario antes de aplicar;
- desplegar todos los callables canónicos por lotes dentro de los límites de CLI;
- restaurar los archivos de entorno temporales;
- no crear ni borrar Functions por accidente;
- no tocar producción.

## Secretos de Geoapify

Los secretos de Geoapify permanecen deliberadamente separados:

- `GEOAPIFY_CITY_API_KEY`: uso exclusivo del servicio de búsqueda/autocomplete de ciudades.
- `GEOAPIFY_API_KEY`: búsqueda general, detalles, reverse geocoding, routing, batch y demás operaciones Geoapify que no pertenecen al catálogo de ciudades.

No deben unificarse, copiarse al frontend, almacenarse como secretos privados en `.env.local`, registrarse en logs ni versionarse. El proyecto no utiliza Nominatim como geocoder alternativo.

## Secretos y proveedores

Las claves privadas de Geoapify y otros proveedores permanecen únicamente del lado servidor. El dato canónico del viaje conserva únicamente campos explícitamente persistibles. Resultados dinámicos, routing, geometría, ETA, tráfico y payloads arbitrarios del proveedor pertenecen a cache/capas derivadas conforme a la política del proveedor.

## Cachés, cuotas y TTL

Las colecciones internas/caches usan expiración cuando corresponde y el código debe validar frescura antes de reutilizar datos. El borrado TTL de Firestore es limpieza operativa, no la fuente de verdad de validez.

Cuotas, caché y observabilidad no deben degradar el contrato de persistencia canónica ni introducir dependencia entre la posibilidad de guardar y el éxito de telemetría.

## Reglas de seguridad

- `firestore.rules` modela el contrato v4 y el aislamiento por UID.
- Los cambios de schema requieren cambios coordinados de Rules y tests de Emulator cuando corresponda.
- Los campos backend-owned/agregados no son autoridad del cliente.
- El versionado/lifecycle impide sobrescrituras o reactivaciones no autorizadas.
- Las colecciones internas y datos de proveedor permanecen aislados según su política.

## Validación del repositorio

La certificación de un HEAD no se limita a que compile. Quality debe avanzar por:

```text
design-preservation contract
unit tests
contract audits
Firestore Rules emulator tests
Phase K scoped E2E Rules
ESLint
production build
```

Además, CodeQL y Dependency Audit deben quedar verdes sobre el mismo SHA que Quality antes de considerar certificado el corte.

Los cambios de documentación que afecten operación también requieren recertificar el HEAD final para evitar entregar una rama distinta de la que fue validada.

## Documentación histórica

Los registros fechados de Gate G pueden conservarse como evidencia de la migración, pero deben estar marcados como históricos y nunca utilizarse como runbooks actuales.

No deben existir guías operativas vigentes que indiquen:

- volver a v3;
- desplegar Rules Gate G;
- activar cohortes de Remote Config para escoger v3/v4;
- exportar `storageV4RolloutTelemetry`;
- usar un repositorio híbrido;
- reintroducir revisiones completas como almacenamiento canónico.

## Estado de esta fase

El runtime autenticado y sus contratos de persistencia están consolidados en v4-only. El cierre de una pasada de cambios se considera completo únicamente cuando el HEAD final —incluyendo documentación operativa— vuelve a obtener Quality, CodeQL y Dependency Audit verdes sobre el mismo SHA.

Ningún paso descrito aquí autoriza por sí mismo despliegues, cambios de Rules remotas, IAM, Remote Config, Secret Manager o producción.