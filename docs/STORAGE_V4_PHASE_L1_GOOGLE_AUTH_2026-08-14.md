# Atlas Storage v4 — Phase L1 Google Authentication evidence

Fecha: **2026-08-14**

Target fijo:

```text
project: atlasmap-prod
web app: AtlasMap Web Production
```

## Resultado productivo

El apply guardado de Google Authentication terminó con **PASS**.

Evidencia observada por el runner:

```text
security-precheck-pass
identity-api-ready
auth-before -> provider absent / disabled
auth-deployed -> Google Sign-In
L1 -> pass: true
```

Post-check server-side:

```text
googleSignInEnabled: true
googleOAuthClientPresent: true
googleOAuthSecretPresent: true
emailPasswordEnabled: false
anonymousEnabled: false
phoneEnabled: false
localhostAuthorized: false
authorizedDomainCountObserved: 2
```

El correo de soporte OAuth fue suministrado explícitamente al apply, pero no se persiste en este documento para minimizar datos personales en evidencia operacional.

## Invariantes preservados

- Firestore Rules no se abrieron;
- Firestore seguía vacío en el security precheck;
- no se desplegaron Functions;
- no se cambió IAM;
- no se habilitó Storage v4 WRITE;
- no se mutaron datos de aplicación;
- no se imprimieron client ID/client secret OAuth;
- no se autorizó `localhost`.

El archivo temporal de configuración Auth se elimina en `finally` después del deploy.

## Alcance

Este PASS demuestra que el provider Google de producción está configurado y verificable server-side. No demuestra todavía login E2E desde el dominio productivo real; ese dominio se introduce con el despliegue cliente/Hosting y se valida durante el rollout correspondiente.
