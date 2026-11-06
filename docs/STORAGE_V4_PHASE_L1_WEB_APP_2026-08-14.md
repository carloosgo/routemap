# Atlas Storage v4 — Phase L1 production Web App evidence

Fecha: 2026-08-14
Proyecto: `atlasmap-prod`

## Resultado

El bootstrap guardado `phase-l:l1:create-web-app-prod` terminó con `pass: true`.

Evidencia observada:

```text
stage: preflight-pass
stage: web-app-create-requested
webAppState: created
webAppCountObserved: 1
displayName: AtlasMap Web Production
sdkConfigProjectMatches: true
```

El `sdkConfig` server-side confirmó presencia de:

- `apiKey`;
- `authDomain`;
- `projectId`;
- `messagingSenderId`;
- `appId`;
- `storageBucket`.

El runner no imprimió la API key ni escribió `.env`.

## Invariantes preservadas

Durante este paso:

- Firestore Rules no se abrieron;
- Authentication providers no cambiaron;
- IAM no cambió;
- Functions no se desplegaron;
- el runner no creó un Storage bucket explícitamente;
- Storage v4 WRITE siguió deshabilitado;
- no se escribieron datos de aplicación.

La aparición de `storageBucket` en el `sdkConfig` es metadata devuelta por Firebase; no es evidencia de que el runner haya aprovisionado Cloud Storage.

## Siguiente gate

L1 continúa con Google Sign-In. El frontend usa `GoogleAuthProvider` + `signInWithPopup`; producción no autorizará `localhost`. El soporte OAuth debe elegirse explícitamente antes del apply de Authentication.
