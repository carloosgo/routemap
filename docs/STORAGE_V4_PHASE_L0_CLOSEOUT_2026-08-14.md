# Atlas Storage v4 — Phase L0 production closeout

Fecha: **2026-08-14**

## Resultado

**PASS** para el target productivo inicial.

Target aprobado y creado:

```text
Project ID: atlasmap-prod
Display name: AtlasMap Production
Firestore database: (default)
Firestore location: us-central1
Firestore mode: Native
Firestore edition: Standard
delete protection: enabled
PITR: diferido explícitamente a L2
```

## Evidencia del bootstrap

La ejecución guardada `phase-l:l0:create-prod` terminó con:

```text
project-ready      -> already-present / ACTIVE
billing-ready      -> already-linked
apis-ready         -> Firebase Management API + Firestore API enabled
firebase-ready     -> Firebase enabled, quota-project header applied
firestore-ready    -> (default) created in us-central1, delete protection enabled
L0                 -> pass: true
```

El `projectState: already-present` y `billingState: already-linked` corresponden a la reanudación idempotente después de un intento previo que alcanzó a crear/enlazar infraestructura antes de fallar en una llamada Firebase Management por quota-project. El runner fue corregido para enviar `x-goog-user-project` de forma aislada, sin modificar ADC/config global.

## Límites del PASS

El bootstrap **no** creó ni habilitó todavía:

- Firebase Web App;
- Authentication providers;
- Functions productivas;
- Eventarc productivo;
- Remote Config productivo;
- App Check productivo;
- reglas v4 productivas;
- despliegue de la aplicación;
- Storage v4 WRITE;
- datos de usuarios;
- PITR productivo.

Por tanto L0 crea la frontera productiva, pero no sirve tráfico ni autoriza escrituras.

## Decisión de ubicación

Producción usa `us-central1`, distinta de la ubicación dev `northamerica-south1`. La decisión evita conservar en producción el puente regional que dev necesita entre Firestore en Querétaro y las Functions v4 en `us-central1`.

Esta ubicación queda tratada como fija para `(default)` y todos los runners posteriores deben fallar si observan otra location.

## Repo

`.firebaserc` registra ahora:

```json
{
  "projects": {
    "default": "atlasmap-dev",
    "dev": "atlasmap-dev",
    "prod": "atlasmap-prod"
  }
}
```

`default` permanece apuntando a dev para impedir que un comando Firebase sin `--project` cambie accidentalmente a producción.

## Siguiente gate

**L1 — seguridad/datos**.

Antes de cualquier deploy productivo, L1 debe confirmar en modo read-only:

1. `atlasmap-prod` ACTIVE y con billing habilitado;
2. Firestore `(default)` en `us-central1` y con delete protection;
3. base productiva vacía;
4. ausencia de Firebase Web Apps inesperadas;
5. ninguna mutación de aplicación, reglas o IAM durante el preflight.

Después de ese PASS se podrá proponer el primer cambio de seguridad productivo con confirmación separada.