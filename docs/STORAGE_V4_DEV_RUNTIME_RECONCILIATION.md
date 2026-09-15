# Atlas Storage v4 — reconciliación del runtime dev/preprod

Ámbito exclusivo: `atlasmap-dev`.

Este procedimiento existe para corregir **drift físico** entre el runtime v4 canónico del repositorio y la infraestructura ya desplegada en dev/preproducción. No es un mecanismo de rollout, migración v3, pilot, cohortes ni Remote Config.

## Contrato

El estado canónico esperado es:

- 3 Functions v4 activas en sus regiones declaradas por `functions/v4BackendManifest.js`;
- 6 triggers Eventarc declarados por el mismo manifest;
- Firestore Rules desplegadas idénticas a `firestore.rules`;
- proyecto objetivo exacto `atlasmap-dev`;
- `atlasmap-prod` fuera de alcance.

El inventario canónico sigue siendo:

```powershell
npm run storage-v4:dev:verify
```

La reconciliación es:

```powershell
npm run storage-v4:dev:reconcile-runtime
```

Ese comando es **dry-run** y no modifica cloud.

Para aplicar exactamente el plan aceptado por las guardas:

```powershell
npm run storage-v4:dev:reconcile-runtime -- --apply --confirm=RECONCILE-ATLAS-V4-DEV-RUNTIME
```

## Qué puede modificar

Solo dos clases de drift se reparan automáticamente:

1. crear un trigger Eventarc canónico que esté **ausente**;
2. desplegar `firestore.rules` cuando las Rules activas no tengan el hash canónico.

El runner no despliega Functions, no despliega Hosting, no cambia App Check, no cambia TTL, no cambia IAM, no modifica datos de aplicación y no toca producción.

## Qué bloquea el apply

La reconciliación se niega a actuar cuando:

- alguna Function v4 canónica falta, está inactiva, usa runtime incorrecto o aparece en región inesperada;
- un trigger Eventarc esperado ya existe pero su configuración es inválida;
- no puede inferirse de manera inequívoca la service account usada por los triggers Eventarc válidos existentes;
- no puede determinarse el Cloud Run service de `v4FirestoreEventIngress`;
- aparece como faltante un trigger que no existe en el manifest canónico.

Un trigger existente con configuración incorrecta **no se reemplaza automáticamente**. Los filtros de Eventarc no son editables después de crear el trigger; ese caso exige revisión explícita antes de eliminar/recrear infraestructura.

## Idempotencia y verificación

Antes de cada ejecución se vuelve a leer el estado físico de Functions, Eventarc y Rules. Por tanto, si una ejecución parcial corrigió una superficie pero otra falló, al reejecutar solo se planifica el drift restante.

Después de un `--apply`, el runner vuelve a ejecutar la verificación canónica hasta observar el estado propagado o fallar de forma visible. El resultado requerido para cerrar el runtime es:

```text
functionsReady: true
eventarc.ready: true
rules.matchesCandidate: true
backendReady: true
staged: true
```

Después se ejecuta la paridad completa:

```powershell
npm run storage-v4:dev:preprod-parity
npm run storage-v4:dev:platform-parity
```

La plataforma y el runtime solo se consideran armonizados cuando ambos contratos pasan sobre el mismo estado desplegado.
