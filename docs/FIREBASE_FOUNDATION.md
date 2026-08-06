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

## Persistencia de viajes

El documento principal del viaje contiene un resumen ligero y apunta a una revisión completa. Tramos, lugares, notas y checklist se guardan en subcolecciones de esa revisión.

Cada tramo puede contener una ruta normalizada con firma, modo, geometría, distancia, duración y fecha de cálculo. La geometría GeoJSON se serializa como JSON antes de escribirla en Firestore porque `LineString` y `MultiLineString` contienen arreglos anidados. Al abrir el viaje se deserializa y se valida antes de incorporarla al estado.

El orden de escritura es:

1. Crear una revisión abierta.
2. Escribir sus colecciones por lotes.
3. Marcar la revisión como completa e inmutable.
4. Publicar el resumen mediante una transacción.
5. Limpiar revisiones anteriores.

Antes de publicar, la transacción comprueba que la versión leída al comenzar el guardado sigue siendo la activa. Un cambio desde otra pestaña o dispositivo produce un conflicto explícito en lugar de sobrescribirlo silenciosamente. Los guardados iniciados desde una misma instancia también se serializan para evitar carreras por doble clic o atajos repetidos.

Los viajes del esquema anterior siguen siendo legibles y se migran al esquema versionado en su siguiente guardado. Los tramos anteriores que no contienen `route` se normalizan con ruta nula y se completan cuando el mapa calcula una firma válida.

## Cambio entre almacenamiento local y nube

- Sin sesión se usa `localStorage`.
- Con sesión se usa Firestore bajo el UID autenticado.
- La importación de viajes locales es manual y nunca elimina el origen local.
- Las respuestas asíncronas de un repositorio anterior se descartan al cambiar la sesión, evitando que una carga local tardía reemplace la lista de Firestore o viceversa.

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

## Estado de la fase

### Implementado

- Google Auth y cierre de sesión.
- Alternancia entre viajes locales y viajes de la cuenta.
- Importación manual de viajes locales.
- Persistencia escalable mediante resúmenes y revisiones inmutables.
- Migración transparente de viajes anteriores.
- Control transaccional de conflictos entre pestañas o dispositivos.
- Protección contra respuestas obsoletas al cambiar de sesión.
- Reglas Firestore, pruebas con emulador, auditoría de dependencias y CodeQL.
- Infraestructura Geoapify protegida conforme a su contrato de uso.
- Rutas por tramo con firma estable, invalidación selectiva, GeoJSON serializado y reutilización al reabrir el viaje.

### Validación manual pendiente

- Flujo emergente de Google en navegadores reales.
- Cambio de sesión con viajes locales y viajes remotos existentes.
- Importación sin pérdida ni eliminación de datos locales.
- Conflicto de edición entre dos pestañas.
- Cálculo gradual de rutas en un viaje con automóvil, transporte público y vuelos.
- Reapertura de un viaje sin repetir llamadas de routing ya persistidas.
- Comportamiento responsive en escritorio y móvil.

### Pendiente operativo

- Subir el proyecto a Blaze para desplegar Functions y usar Secret Manager.
- Configurar TTL para las colecciones internas.
- Registrar App Check, observar métricas y activar enforcement.
- Crear el proyecto separado de producción.
- Configurar Hosting, dominio, alertas de presupuesto y monitorización.
- Definir backups, retención, aviso de privacidad y eliminación de cuenta/datos.

### Fase funcional posterior

Las rutas actuales pertenecen a los tramos entre ciudades. Un modelo independiente para conectar lugares guardados, elegir caminata o bicicleta y construir recorridos internos de cada ciudad se implementará en otra fase.
