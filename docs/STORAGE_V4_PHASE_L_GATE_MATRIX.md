# Atlas Storage v4 — Phase L gate matrix

Fecha: **2026-08-15**

Esta matriz separa tres conceptos: implementación de soporte, evidencia cloud y autorización de rollout. Tener un runner o test listo no equivale a haber cerrado el gate productivo.

## Decisión operativa vigente

Atlas continúa en desarrollo activo y todavía recibirá cambios relevantes de producto e implementación. Por esa razón, el rollout funcional de Storage v4 en producción queda **deliberadamente congelado**.

`atlasmap-dev` es el entorno canónico de integración real. `atlasmap-prod` conserva la infraestructura productiva ya aprobada, pero no se usa como entorno de experimentación.

El modo de trabajo detallado está documentado en `docs/STORAGE_V4_DEV_STEADY_STATE.md`.

| Gate | Soporte repo | Evidencia cloud | Estado operativo |
|---|---|---|---|
| L0 target productivo | listo | PASS | cerrado |
| L1 seguridad/Auth | listo | PASS | cerrado fail-closed |
| L2 recovery/costo | runners listos | PASS para PITR + schedule + budget; backup READY aún pendiente | infraestructura configurada; restore drill pendiente y separado |
| L3 App Check | cliente preintegrado + preflight listo | PASS de baseline: Web App correcta, APIs/config aún OFF | diferido hasta dominio/hosting productivo real |
| L4 READ | planner + contratos/tests listos | ninguna | congelado; no iniciado productivamente |
| L5 materialización | planner + contratos/tests listos | ninguna | congelado; no iniciado productivamente |
| L6 WRITE | planner + contratos/tests listos | ninguna | congelado; no iniciado productivamente |
| L7 convergencia | planner + contratos/tests listos | ninguna | congelado; no iniciado productivamente |

## Evidencia productiva observada

### L2

Preflight consolidado productivo confirmó:

```text
project: atlasmap-prod
firestoreLocation: us-central1
deleteProtectionEnabled: true
pitrEnabled: true
versionRetentionPeriod: 604800s
backupScheduleCountObserved: 1
readyBackupCountObserved: 0
projectScopedBudgetCountObserved: 1
storageV4ReadEnabled: false
storageV4WriteEnabled: false
```

Recovery aplicado y post-verificado:

```text
PITR: 7 días
backup schedule: daily
backup retention: 7d
```

Budget aplicado y post-verificado:

```text
displayName: Atlas Storage v4 production
amount: 500 MXN
thresholds: 0.5, 0.8, 1
calendarPeriod: MONTH
spendBasis: CURRENT_SPEND
```

El restore drill productivo **no** está incluido en esas autorizaciones. Debe esperar al menos un backup `READY`, usar una database temporal aislada y recibir autorización explícita separada.

### L3

El preflight read-only confirmó:

```text
project: atlasmap-prod
webAppCountObserved: 1
expectedWebAppPresent: true
appCheckApiEnabled: false
recaptchaEnterpriseApiEnabled: false
recaptchaEnterpriseConfigObserved: false
recaptchaEnterpriseSiteKeyConfigured: false
enforcementChanged: false
storageV4ReadEnabled: false
storageV4WriteEnabled: false
```

No existe todavía dominio/hosting productivo definitivo. Por diseño, L3 no crea una key provisional, no registra App Check contra `localhost` y no habilita enforcement antes de poder desplegar y observar tráfico real.

## Steady state de desarrollo

Antes de bloques importantes que dependan de infraestructura cloud real se dispone del preflight:

```powershell
npm run storage-v4:dev:steady-state
```

Ese runner es read-only y verifica el stage v4 real de `atlasmap-dev` más el checkpoint cloud consolidado de Phase K. No admite `--apply` ni `--confirm` y falla si detecta que el stage no es el dev esperado, que Remote Config no está fail-closed al iniciar el bloque o que alguna invariante de backend/Rules/Eventarc deja de cumplirse.

Para experimentos v4 reales en dev se siguen usando los runners de pilot ya existentes con cohortes y confirmaciones explícitas. Al terminar un bloque experimental se vuelve al kill switch y se revalida steady state.

## Guardas transversales

- `atlasmap-prod` es target explícito para runners productivos L1+.
- runners mutables productivos exigen token de confirmación específico.
- planners L4–L7 rechazan `--apply`/`--confirm`.
- no hay porcentajes de cohorte por default.
- no hay tamaño de muestra L5 por default.
- Storage v4 READ/WRITE productivo permanece deshabilitado durante el steady state de desarrollo.
- Storage v4 WRITE sigue deshabilitado hasta L6 incluso cuando se retome Phase L.
- v3 no se retira antes de canonical v4 = 100% y gate explícito L7.
- delete de viaje permanece irreversible para el usuario; backup/DR no crea restore público.
- App Check no se registra con un dominio provisional ni usa debug tokens productivos.
- cerrar o preparar un gate no autoriza automáticamente el siguiente.

## Criterio para retomar Phase L

Phase L productiva se retomará mediante decisión explícita, no por acumulación de cambios en dev.

Antes de cruzar L4 deberán existir, como mínimo:

1. producto suficientemente estable para iniciar rollout real;
2. backup productivo `READY` y decisión explícita sobre el restore drill pendiente;
3. dominio/hosting productivo definitivo;
4. App Check registrado y observado sin enforcement inicial;
5. evidencia de tráfico App Check VALID/INVALID/MISSING suficiente;
6. revalidación de Rules, Remote Config, telemetría y rollback productivos;
7. porcentaje de primera cohorte READ elegido explícitamente.

Hasta entonces, la prioridad es seguir construyendo y endureciendo Atlas sobre `atlasmap-dev` con infraestructura real y producción protegida.
