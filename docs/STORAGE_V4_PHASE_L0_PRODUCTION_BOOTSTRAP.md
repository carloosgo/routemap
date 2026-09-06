# Atlas Storage v4 — Phase L0 production bootstrap

## Propósito

Crear por primera vez el proyecto productivo de Atlas de forma separada de `atlasmap-dev`, con guardas explícitas y sin desplegar la aplicación ni habilitar Storage v4 WRITE.

El bootstrap está diseñado para ejecutarse primero en modo `plan` y únicamente mutar Cloud cuando se agrega `--apply` con un token ligado al Project ID exacto.

## Qué crea

Cuando el target aún no existe:

1. crea el Google Cloud project con etiquetas `environment=production` y `system=atlas-storage-v4`;
2. reutiliza la misma cuenta de facturación activa de `atlasmap-dev`, sin imprimir su ID;
3. habilita Firebase Management API y Cloud Firestore API;
4. agrega Firebase al proyecto;
5. crea Firestore `(default)` en Native mode, Standard edition, en la location explícitamente aprobada;
6. habilita delete protection para la base.

No crea todavía:

- PITR productivo: queda detrás del gate L2 recovery/cost;
- Firebase Web App;
- Authentication providers;
- Functions productivas;
- Eventarc productivo;
- Remote Config productivo;
- alertas productivas;
- reglas/deploy de aplicación;
- datos de usuario;
- Storage v4 WRITE.

Esos pasos pertenecen a gates posteriores de Phase L.

## Idempotencia y seguridad

- `atlasmap-dev` está bloqueado.
- Project ID y location son obligatorios.
- El token de confirmación incorpora el Project ID exacto.
- Si el Project ID ya existe pero no lleva las etiquetas del bootstrap Atlas v4, el runner aborta y no lo adopta.
- Si el target ya está ligado a una cuenta de facturación diferente, aborta y no la reemplaza.
- Si una ejecución se interrumpe después de crear el proyecto, una ejecución posterior puede reanudarlo siempre que conserve las etiquetas esperadas.
- Nunca borra automáticamente el proyecto en caso de error parcial.
- El billing account ID y los access tokens no se imprimen.

## Plan

```powershell
npm run phase-l:l0:create-prod -- `
  --project=<PROJECT_ID> `
  --location=<LOCATION>
```

Esto no toca Cloud.

## Apply

```powershell
npm run phase-l:l0:create-prod -- `
  --project=<PROJECT_ID> `
  --location=<LOCATION> `
  --apply `
  --confirm=CREATE-ATLAS-V4-PROD-<PROJECT_ID>
```

El Project ID debe ser globalmente único. Si Google rechaza el ID por no estar disponible, no se crea nada con otro nombre de forma automática: se elige otro ID explícitamente y se vuelve a ejecutar.

## Firestore

La location se fija al crear `(default)` y el runner exige que coincida exactamente con la aprobada. La base se crea con:

```text
mode: firestore-native
edition: standard
delete protection: enabled
PITR: no gestionado en L0; se decide/activa en L2
```

La separación es intencional: PITR genera costo de almacenamiento y forma parte del gate productivo de recovery/cost, no del bootstrap de identidad/location.

## Después del PASS

Después de un `pass: true`:

1. ejecutar `phase-l:l0:preflight -- --check-cloud` contra el mismo Project ID/location;
2. agregar el alias `prod` a `.firebaserc` únicamente después de verificar que el proyecto real existe;
3. registrar el target aprobado en la documentación de implementación;
4. avanzar a L1 sin habilitar todavía tráfico ni escrituras productivas;
5. activar PITR solo al llegar a L2 con su costo/protección aprobados.