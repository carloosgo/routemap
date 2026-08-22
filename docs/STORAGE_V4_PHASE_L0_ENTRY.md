# Atlas Storage v4 — Phase L0 production entry

## Objetivo

L0 identifica y verifica el target productivo antes de cualquier acción de rollout. Es un gate **read-only y fail-closed**.

El repositorio actual solo contiene:

```json
{
  "default": "atlasmap-dev",
  "dev": "atlasmap-dev"
}
```

No existe un alias ni project ID productivo registrado. Por tanto, L0 no puede heredar `default`, asumir que dev será producción ni inventar un nombre.

## Inputs obligatorios

- Firebase / Google Cloud project ID productivo explícito;
- Firestore location esperada explícita.

La location no se copia automáticamente de dev. Si se decide reutilizar `northamerica-south1`, debe ser una decisión explícita para producción.

## Runner

```text
npm run phase-l:l0:preflight -- --project=<PROJECT_ID> --location=<LOCATION>
```

Sin `--check-cloud`, el runner solo valida localmente los argumentos y muestra el plan. No toca Cloud.

Para verificar el proyecto una vez aprobado el target:

```text
npm run phase-l:l0:preflight -- --project=<PROJECT_ID> --location=<LOCATION> --check-cloud
```

El modo `--check-cloud` es exclusivamente read-only y verifica:

- que el proyecto exista y esté ACTIVE;
- que billing esté habilitado;
- que exista Firestore `(default)`;
- que su `locationId` coincida exactamente con la location aprobada.

El runner nunca imprime el billing account ID.

## Guardas

- `--project` obligatorio;
- `--location` obligatorio;
- `atlasmap-dev` rechazado explícitamente;
- `--apply` no existe;
- no cambia IAM;
- no cambia Billing;
- no crea/modifica Firestore;
- no toca Remote Config;
- no despliega Functions;
- no habilita Storage v4 WRITE;
- no autoriza mutaciones productivas.

## Criterio PASS L0

L0 puede declararse PASS solo cuando:

1. exista un project ID productivo aprobado y distinto de `atlasmap-dev`;
2. la location productiva haya sido elegida explícitamente;
3. el preflight cloud read-only confirme proyecto ACTIVE, billing enabled y Firestore `(default)` en esa location.

Solo después se prepara L1. Un PASS de L0 no autoriza por sí solo ningún deploy ni cambio de datos.