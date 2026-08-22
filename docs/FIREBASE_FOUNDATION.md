# Firebase Foundation — Atlas

## Entorno actual

- Proyecto Firebase de desarrollo: `atlasmap-dev`
- Plan: Blaze
- Authentication: Google
- Firestore: Standard, base `(default)`, región `northamerica-south1`
- Cloud Functions Gen 2: región `us-central1`, runtime Node.js 22
- Rama activa: `agent/phase-3-firebase-foundation`

## Principios de arquitectura

1. Desarrollo y producción usan proyectos Firebase distintos.
2. La configuración pública del Web SDK se carga desde `.env.local`; cuentas de servicio y secretos nunca se incrustan en frontend.
3. Los viajes pertenecen al UID indicado por `users/{uid}/trips/{tripId}`.
4. El cliente no puede leer ni escribir fuera de su UID.
5. Las reglas validan campos permitidos, forma y límites máximos.
6. El repositorio local permanece disponible para desarrollo, uso sin sesión y recuperación.
7. App Check se configura y observa antes de activar enforcement.
8. Las Functions públicas usan cuota compartida, límites de instancias y caché con expiración.
9. Las claves privadas de proveedores viven únicamente en Firebase Secret Manager.
10. Trayectos y Lugares son dominios independientes y solo comparten el lienzo de mapa.

## Persistencia: estado actual y arquitectura objetivo

El almacenamiento activo sigue siendo **v3**. No se ha conectado v4 al selector de repositorio productivo.

El contrato objetivo de persistencia incremental, local-first, multi-dispositivo y preparado para web/iOS/Android está definido en:

- `docs/STORAGE_ARCHITECTURE_V4.md`

La activación v4 es por gates. No se permite sustituir v3 hasta que las pruebas de la fase correspondiente, reglas de Emulator, rollback y telemetría requeridos por ese documento hayan pasado.

## Secretos de Geoapify

Se mantienen dos secretos deliberadamente separados:

- `GEOAPIFY_CITY_API_KEY`: uso exclusivo de `geoapifyCityAutocomplete`.
- `GEOAPIFY_API_KEY`: búsqueda general, detalles, reverse geocoding, routing y batch.

No deben unificarse, copiarse al frontend, almacenarse en `.env.local`, registrarse en logs ni versionarse.

## Callable Functions actuales

- `geoapifyCityAutocomplete`
- `geoapifyPlaceSearch`
- `geoapifyAutocomplete`
- `geoapifyPlaceDetails`
- `geoapifyRoute`
- `geoapifyReverse`
- `geoapifyBatchGeocode`
- `geoapifyBatchGeocodeResult`
- `geoapifyCountryBoundary`

`geoapifyCityAutocomplete` declara `enforceAppCheck: false` de forma explícita mientras termina la activación gradual de App Check. Las demás Functions heredan el parámetro global `ENFORCE_APP_CHECK`, cuyo valor predeterminado es `false`.

## Persistencia de viajes v3 (activa)

El documento principal contiene un resumen ligero y apunta a una revisión completa. Trayectos, lugares, notas y checklist se guardan en subcolecciones de la revisión.

El orden de escritura es:

1. Crear una revisión abierta.
2. Escribir las subcolecciones por lotes.
3. Marcar la revisión como completa e inmutable.
4. Publicar el resumen mediante una transacción.
5. Limpiar revisiones anteriores.

La transacción detecta cambios realizados desde otra pestaña o dispositivo y evita sobrescrituras silenciosas. Los viajes legados siguen siendo legibles y se migran al esquema versionado en su siguiente guardado.

## Cambio entre almacenamiento local y nube

- Sin sesión se usa `localStorage`.
- Con sesión se usa Firestore bajo el UID autenticado.
- La importación de viajes locales es manual y no elimina el origen local.
- Las respuestas asíncronas de un repositorio anterior se descartan al cambiar de sesión.

## App Check

El frontend está preparado para reCAPTCHA Enterprise mediante:

```text
VITE_FIREBASE_APPCHECK_SITE_KEY=<site-key-publica>
```

Secuencia segura de activación:

1. Registrar la aplicación web y sus dominios legítimos.
2. Añadir la clave pública al entorno del frontend.
3. Desplegar con enforcement desactivado.
4. Observar solicitudes verificadas y no verificadas.
5. Activar `ENFORCE_APP_CHECK=true` gradualmente y documentar rollback.

No se debe activar enforcement antes de completar esa secuencia.

## Cachés, cuotas y TTL

Las colecciones internas incluyen `expiresAt` y el código valida la expiración antes de reutilizar datos:

- `citySearchCache`
- `placeSearchCache`
- `geocodeCache`
- `placeDetailsCache`
- `routeCache`
- `countryBoundaryCache`
- `functionRateLimits`
- `geoapifyBatchJobs`

La eliminación mediante TTL de Firestore es asíncrona y debe configurarse operativamente para cada colección.

## Validación

Desde la raíz:

```bash
npm ci
npm test
npm run test:rules
npm run lint
npm run build
```

Las Functions usan Node.js 22 y las pruebas del emulador requieren Java 21.

## Estado de la fase

### Implementado

- Proyecto Blaze, Firestore y Secret Manager.
- Google Auth y persistencia local/remota.
- Resúmenes ligeros y revisiones inmutables v3.
- Reglas Firestore y pruebas con emulador.
- Cuotas, cachés y límites comunes de callable Functions.
- Autocomplete privado de ciudades con clave exclusiva y `type=city` forzado.
- Separación estricta entre Trayectos y Lugares.
- Resolución del error 401 del autocomplete mediante override explícito de App Check.
- Contrato de arquitectura Storage v4 y modelos puros iniciales sin activación productiva.

### Pendiente de cierre de auditoría

- Ejecutar nuevamente pruebas, reglas, lint y build sobre el HEAD final.
- Confirmar el resultado de Quality checks, CodeQL y Dependency audit.
- Revisar manualmente los flujos principales en navegador.
- Configurar TTL de colecciones internas si aún no está activo.
- Actualizar documentación operativa cuando cambien despliegues o secretos.

### Fase funcional posterior

Las conexiones y rutas reales se implementan únicamente entre lugares guardados dentro de Lugares. Tienen modelo, persistencia y capas propios; no forman parte de `segment` ni sustituyen las curvas visuales de Trayectos.
