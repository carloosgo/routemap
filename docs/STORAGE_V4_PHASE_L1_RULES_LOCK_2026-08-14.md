# Atlas Storage v4 — Phase L1 production Firestore Rules lock

Fecha: **2026-08-14**

## Target

- proyecto: `atlasmap-prod`
- Firestore: `(default)`
- región: `us-central1`
- edición: Standard / Native
- delete protection: enabled

## Preflight previo

El preflight read-only confirmó antes del cambio:

- proyecto ACTIVE;
- billing enabled;
- Firestore `(default)` presente en `us-central1`;
- delete protection enabled;
- 0 top-level collections observadas;
- 0 Firebase Web Apps observadas;
- Storage v4 WRITE deshabilitado;
- sin mutaciones de datos.

## Apply de Rules

Comando ejecutado:

```text
npm run phase-l:l1:lock-rules-prod -- --apply --confirm=LOCK-ATLAS-V4-PROD-L1-RULES
```

Resultado:

- `pass=true`;
- `firestoreRulesLocked=true`;
- `denyAllClientReadsAndWrites=true`;
- `serverSideRulesSourceMatched=true`;
- release activo: `projects/atlasmap-prod/releases/cloud.firestore`;
- ruleset activo: `projects/atlasmap-prod/rulesets/dfc3998c-190a-42a5-bdb2-cce906331af2`;
- Web App no creada;
- Auth sin cambios;
- IAM sin cambios;
- Functions no desplegadas;
- Storage v4 WRITE no habilitado;
- datos de aplicación no mutados.

El proyecto era nuevo y no existía un release Firestore previo, por lo que `previousReleaseName` y `previousRulesetName` fueron `null`. No existe por tanto un ruleset anterior que pueda registrarse como rollback pointer; el baseline deny-all es el primer release conocido de Rules en producción.

## Source activo esperado

```text
rules_version = '2';

service cloud.firestore {
  match /databases/{database}/documents {
    match /{document=**} {
      allow read, write: if false;
    }
  }
}
```

## Estado después del paso

Firestore productivo permanece vacío y cerrado para clientes web/móvil. Este paso no autoriza todavía Authentication, App Check, deploy de Functions, READ v4 ni WRITE v4.