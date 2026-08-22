# Atlas Storage v4 — Operating state — 2026-08-15

Este documento es el snapshot operativo actual. Si un documento histórico de 2026-08-14 contradice este archivo, usar la evidencia cloud más reciente y los closeouts finales de cada fase.

## Estrategia vigente

```text
local/emulators -> iteración rápida
atlasmap-dev    -> preproducción real / integración cloud
atlasmap-prod   -> infraestructura protegida; rollout funcional congelado
```

El objetivo inmediato es continuar cambios de producto e implementación sobre una infraestructura dev real y sólida. Phase L productiva no se sigue empujando hasta una decisión explícita posterior.

## atlasmap-dev

### Phase K final

`STORAGE_V4_PHASE_K_CLOSEOUT_2026-08-14.md` es la fuente final de Phase K.

Dev ya dispone de:

- Firestore real en `northamerica-south1`;
- PITR 7 días;
- backup diario, retención 7 días;
- backups READY y restore drill aislado + cleanup PASS;
- budget project-scoped `Atlas Storage v4 dev`: 500 MXN/mes, 50/80/100%;
- 3/3 alert policies permanentes habilitadas;
- dashboard, 7 logs-based metrics, notification channel y delivery drill;
- 3 Functions v4 Node.js 22;
- 5 Eventarc triggers con service account dedicada;
- Rules pilot coincidentes con candidato aprobado;
- migración/rollback/remigración, lifecycle, purge, provider outage, sync flush y cloud load probados.

### Runtime actual observado 2026-08-15

El último stage verify mostró:

```text
Functions: 3/3 ACTIVE
Eventarc: 5/5 valid
Rules: active SHA == candidate SHA
backendReady: true
readinessCandidates: all true
Remote Config:
  enabled=true
  killSwitch=false
  mode=pilot
  cohortPercent=0.01
```

El pilot `0.01%` es intencionalmente válido para preprod. No se debe ejecutar kill únicamente para satisfacer el guardrail de steady-state fail-closed.

### Dos preflights distintos

`npm run storage-v4:dev:steady-state`

- exige Remote Config OFF/fail-closed;
- se usa entre experimentos cuando queremos baseline apagado.

`npm run storage-v4:dev:preprod-parity`

- acepta OFF/fail-closed o pilot controlado;
- exige Functions/Rules/Eventarc/readiness íntegros;
- ejecuta el checkpoint Phase K;
- es el preflight adecuado mientras dev actúa como preproducción.

`npm run storage-v4:dev:platform-parity`

- inventaría Web App/Auth, Hosting, App Check/reCAPTCHA, servicios cloud y TTL policies;
- no crea recursos;
- devuelve gaps explícitos para cerrar después con operaciones dev autorizadas.

## atlasmap-prod

### L0

PASS y cerrado:

- proyecto `atlasmap-prod` ACTIVE;
- billing ligado;
- Firebase enabled;
- Firestore `(default)` Standard/Native en `us-central1`;
- Delete Protection enabled.

### L1

PASS y cerrado fail-closed:

- exactamente 1 Web App: `AtlasMap Web Production`;
- Google Sign-In enabled;
- email/password, anonymous y phone disabled;
- localhost no autorizado;
- Rules productivas permanecen cerradas para tráfico de app.

### L2

Configuración aplicada y post-check PASS:

- PITR enabled;
- version retention `604800s` = 7 días;
- exactamente 1 backup schedule diario;
- backup retention 7 días;
- exactamente 1 budget project-scoped;
- budget 500 MXN/mes;
- thresholds 50/80/100%;
- Storage v4 READ/WRITE continúan OFF.

En el último preflight productivo:

```text
readyBackupCountObserved: 0
```

Por tanto el restore drill productivo continúa pendiente de que exista un backup READY. El drill requiere autorización separada y debe restaurar exclusivamente a una database temporal aislada, nunca `(default)`.

### L3

Preflight productivo PASS como inventario, con baseline vacío:

- Web App esperada presente;
- App Check API disabled;
- reCAPTCHA Enterprise API disabled;
- no App Check registration;
- no site key;
- no enforcement.

No existe todavía dominio/hosting productivo definitivo. L3 se pausa deliberadamente; no se registra App Check contra un dominio provisional.

### L4-L7

Rollout funcional productivo congelado:

- no READ cohort;
- no materialización productiva;
- no WRITE v4 productivo;
- no convergencia/retiro v3.

Los planners/contratos permanecen en el repo para retomar Phase L más adelante.

## Próximo trabajo de infraestructura

Sin tocar producción:

1. ejecutar `storage-v4:dev:preprod-parity` sobre el HEAD actual;
2. ejecutar `storage-v4:dev:platform-parity`;
3. usar esos outputs para cerrar únicamente gaps reales de dev, especialmente Hosting/App Check/TTL/Delete Protection si faltan;
4. cada mutación cloud dev conserva confirmación explícita y post-check;
5. continuar nuevas funcionalidades de Atlas contra `atlasmap-dev`.

## Invariantes

- no usar `atlasmap-prod` como backend de desarrollo;
- no asumir que código/runners equivalen a infraestructura desplegada;
- no duplicar budgets, policies o recursos que ya existen;
- no guardar secretos/debug tokens en repo;
- no autorizar localhost como dominio reCAPTCHA;
- no activar App Check enforcement antes de observation;
- no cambiar READ/WRITE productivo mientras el rollout esté congelado.
