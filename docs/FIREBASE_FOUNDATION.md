# Firebase Foundation — Atlas

## Entorno actual

- Proyecto Firebase de desarrollo: `atlasmap-dev`
- Authentication: Google únicamente
- Firestore: Standard, base `(default)`, modo de producción
- Ubicación: `northamerica-south1` (Querétaro)
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
8. App Check se activa después de definir dominios de desarrollo y producción.

## Archivos de infraestructura

- `.firebaserc`: alias del proyecto de desarrollo.
- `firebase.json`: Firestore y Emulator Suite.
- `firestore.rules`: aislamiento y validación de viajes.
- `firestore.indexes.json`: índices versionados.
- `.env.example`: variables públicas esperadas.

## Instalación local pendiente

Ejecutar desde la raíz del proyecto:

```bash
npm install firebase
npm install --save-dev firebase-tools @firebase/rules-unit-testing
```

Después deben versionarse `package.json` y `package-lock.json`.

## Próximos bloques

### 3A.1 SDK y emuladores

- Inicialización segura del SDK web.
- Conexión opcional a Auth y Firestore Emulator.
- Pruebas automatizadas de Security Rules.

### 3A.2 Persistencia

- `FirestoreTripRepository`.
- Consultas limitadas al usuario autenticado.
- Normalización antes de escribir y después de leer.
- Manejo explícito de errores y estado offline.

### 3B Flujo visible — requiere aprobación

- Inicio de sesión con Google.
- Cierre de sesión.
- Estado de carga de sesión.
- Migración de viajes locales a la cuenta.
- Eliminación de cuenta y datos.

### 3C Producción

- Proyecto `atlas-prod`.
- App Check.
- Hosting y dominio.
- Alertas de presupuesto y monitorización.
- Backups y política de retención.
- Aviso de privacidad y proceso de eliminación.
