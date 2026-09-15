# Atlas Storage v4 — Phase L1 security/data entry

## Target fijo

```text
project: atlasmap-prod
Firestore: (default)
location: us-central1
```

L1 no acepta un project ID por parámetro. El runner está ligado explícitamente al target productivo aprobado en L0 para reducir riesgo de apuntar a otro entorno.

## Paso 1 — preflight read-only

```powershell
npm run phase-l:l1:preflight-prod -- --check-cloud
```

Verifica sin mutar Cloud:

- proyecto ACTIVE;
- billing enabled;
- Firestore `(default)` en `us-central1`;
- Native mode / Standard edition;
- delete protection enabled;
- 0 colecciones top-level productivas;
- 0 Firebase Web Apps activas.

Las lecturas REST usan `x-goog-user-project: atlasmap-prod` únicamente por request. El runner no modifica ADC global.

El preflight no admite `--apply`.

## Paso 2 — baseline Firestore locked

Archivo:

```text
firestore.l1.prod.locked.rules
```

Contrato:

```text
all mobile/web reads  -> denied
all mobile/web writes -> denied
```

El objetivo es que el proyecto nazca fail-closed antes de crear la Firebase Web App, Authentication o cualquier rollout de READ/WRITE.

Plan local:

```powershell
npm run phase-l:l1:lock-rules-prod
```

Apply guardado:

```powershell
npm run phase-l:l1:lock-rules-prod -- `
  --apply `
  --confirm=LOCK-ATLAS-V4-PROD-L1-RULES
```

El apply:

1. vuelve a ejecutar el preflight L1 read-only;
2. habilita `firebaserules.googleapis.com` si hace falta;
3. despliega **solo Firestore Rules** usando un config temporal;
4. no despliega indexes, Functions, Hosting ni aplicación;
5. consulta Firebase Rules API después del deploy;
6. verifica que el Ruleset activo coincide exactamente con `firestore.l1.prod.locked.rules`;
7. elimina el archivo config temporal local.

No existe rollback automático a reglas previas. Si la verificación post-deploy fallara, el estado deny-all es el estado seguro y debe revisarse antes de abrir acceso.

## Lo que L1 locked NO hace

- no crea Firebase Web App;
- no habilita Google Authentication;
- no cambia IAM;
- no crea Functions/Eventarc;
- no configura Remote Config;
- no habilita App Check;
- no habilita Storage v4 READ/WRITE;
- no crea ni migra datos de usuarios.

## Después del locked PASS

El resto de L1 prepara Web App + Authentication con configuración productiva propia. Las reglas funcionales para READ/WRITE no se abren en este paso: se introducen gradualmente en L4/L6 con kill-switch/readiness gates.