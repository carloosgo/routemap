# Firebase Foundation — Atlas

## Entorno actual

- Proyecto Firebase de desarrollo: `atlasmap-dev`
- Authentication: Google únicamente
- Firestore: Standard, base `(default)`, modo de producción
- Ubicación: `northamerica-south1` (Querétaro)
- Cloud Functions: `us-central1`, región compatible más cercana disponible para Firebase Functions
- Rama: `agent/phase-3-firebase-foundation`

## Principios de arquitectura

1. Desarrollo y producción usan proyectos Firebase distintos.
2. La configuración Web SDK se carga desde `.env.local`; nunca se incrustan cuentas de servicio.
3. Los documentos pertenecen al UID indicado por la ruta:

   `users/{uid}/trips/{tripId}`

4. El cliente no puede leer ni escribir fuera de su UID.
5. Las reglas validan forma general, tamaños máximos y campos permitidos.
6. El repositorio local permanece disponible para desarrollo y recuperación.
7. Los emuladores se usan para probar Auth y Firestore sin tocar datos reales.
8. App Check se registra y observa antes de activar enforcement.
9. Las Functions públicas tienen cuota compartida, límites de instancias y caché con expiración.
10. Las claves privadas de proveedores viven únicamente en Secret Manager.

## Archivos de infraestructura

- `.firebaserc`: alias del proyecto de desarrollo.
- `firebase.json`: Firestore y Emulator Suite.
- `firestore.rules`: aislamiento y validación de viajes.
- `firestore.indexes.json`: índices versionados.
- `.env.example`: variables públicas esperadas.
- `functions/callablePolicy.js`: App Check, cuotas y límites comunes.
- `functions/sharedCache.js`: caché compartida con TTL e in-flight deduplication.
- `docs/GEOAPIFY_USAGE_CONTRACT.md`: invariantes de consumo del proveedor.

## App Check

La app web está preparada para reCAPTCHA Enterprise mediante:

```text
VITE_FIREBASE_APPCHECK_SITE_KEY=<site-key-publica>
```

Las callable functions usan el parámetro:

```text
ENFORCE_APP_CHECK=false
```

Secuencia segura de activación:

1. Registrar la app web en Firebase App Check con reCAPTCHA Enterprise.
2. Añadir la clave pública en el entorno del frontend.
3. Desplegar con enforcement desactivado.
4. Observar métricas de solicitudes verificadas y no verificadas.
5. Activar `ENFORCE_APP_CHECK=true` cuando el tráfico legítimo esté validado.

No se debe activar enforcement antes de configurar todos los dominios y clientes legítimos.

## TTL de Firestore

Las colecciones internas usan el campo `expiresAt`:

- `placeSearchCache`
- `geocodeCache`
- `placeDetailsCache`
- `routeCache`
- `countryBoundaryCache`
- `functionRateLimits`
- `geoapifyBatchJobs`

La política TTL debe configurarse en cada colección desde Google Cloud o mediante infraestructura como código. El TTL es una limpieza asíncrona; el código siempre valida la expiración antes de reutilizar un documento.

## Validación local

Desde la raíz:

```bash
npm ci
npm test
npm run test:rules
npm run lint
npm run build
```

Las Functions usan Node 22 y los emuladores de Firestore requieren Java 21.

## Próximos bloques

### Persistencia escalable

- Separar resumen del viaje y colecciones grandes.
- Añadir `schemaVersion`, versión de escritura y timestamps del servidor.
- Diseñar migración sin pérdida de viajes existentes.

### Flujo visible — requiere aprobación

- Inicio de sesión con Google.
- Cierre de sesión.
- Estado de carga de sesión.
- Migración de viajes locales a la cuenta.
- Eliminación de cuenta y datos.

### Producción

- Proyecto `atlas-prod`.
- App Check con enforcement.
- Hosting y dominio.
- Alertas de presupuesto y monitorización.
- Backups y política de retención.
- Aviso de privacidad y proceso de eliminación.
