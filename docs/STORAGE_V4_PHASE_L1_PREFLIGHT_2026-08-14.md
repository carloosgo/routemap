# Atlas Storage v4 — Phase L1 production preflight

Fecha: **2026-08-14**

Target productivo:

- project: `atlasmap-prod`
- Firestore `(default)`: `us-central1`

## Resultado

El preflight read-only de L1 fue ejecutado localmente con credenciales autenticadas:

```text
npm run phase-l:l1:preflight-prod -- --check-cloud
```

Resultado observado: **PASS**.

```json
{
  "phase": "L1",
  "pass": true,
  "project": "atlasmap-prod",
  "projectActive": true,
  "billingEnabled": true,
  "billingAccountIdExposed": false,
  "firestoreDefaultDatabasePresent": true,
  "firestoreLocation": "us-central1",
  "firestoreMode": "native",
  "firestoreEdition": "standard",
  "firestoreDeleteProtectionEnabled": true,
  "topLevelCollectionCountObserved": 0,
  "firebaseWebAppCountObserved": 0,
  "quotaProjectHeaderApplied": true,
  "mutatesCloud": false,
  "rulesChanged": false,
  "authChanged": false,
  "applicationDataMutated": false,
  "storageV4WriteEnabled": false
}
```

## Interpretación

Antes del primer hardening de seguridad de L1 quedó demostrado que:

- el proyecto productivo está ACTIVE;
- billing está habilitado;
- Firestore `(default)` existe en la location aprobada;
- la base es Native / Standard;
- delete protection está habilitada;
- no existen colecciones top-level productivas;
- no existe Firebase Web App productiva;
- el preflight no modificó Rules, Auth, IAM, Functions ni datos;
- Storage v4 WRITE productivo permanece deshabilitado.

## Siguiente paso

Desplegar el baseline `firestore.l1.prod.locked.rules` mediante el runner guardado `phase-l:l1:lock-rules-prod`.

Ese cambio debe:

1. repetir el preflight read-only antes del deploy;
2. capturar el release/ruleset Firestore anterior como puntero de rollback;
3. desplegar exclusivamente Firestore Rules a `atlasmap-prod`;
4. verificar server-side que el source activo coincide exactamente con el baseline deny-all;
5. no crear Web App, no modificar Auth/IAM, no desplegar Functions y no escribir application data.
