# Atlas Storage v4 — Phase L2 recovery + cost entry

Fecha: **2026-08-14**

Target fijo:

```text
project: atlasmap-prod
Firestore: (default)
location: us-central1
```

L2 no habilita Storage v4 READ/WRITE y no abre Firestore Rules.

## 1. Preflight read-only

```powershell
npm run phase-l:l2:preflight-prod -- --check-cloud
```

Observa sin mutar:

- PITR;
- backup schedules;
- backups `READY` disponibles;
- budgets project-scoped;
- invariantes de location/delete protection/billing.

## 2. Recovery bootstrap

El runner exige retención explícita; no existe default silencioso.

Plan ejemplo:

```powershell
npm run phase-l:l2:recovery-prod -- --backup-retention=7d
```

Apply guardado:

```powershell
npm run phase-l:l2:recovery-prod -- `
  --backup-retention=7d `
  --apply `
  --confirm=ENABLE-ATLAS-V4-PROD-L2-RECOVERY
```

El apply:

- verifica `atlasmap-prod` / `us-central1` / delete protection;
- habilita PITR si está deshabilitado;
- crea un único backup schedule diario si no existe;
- no sobrescribe automáticamente un schedule existente diferente;
- verifica server-side PITR + schedule después del cambio;
- no ejecuta restore automáticamente.

El restore drill se ejecuta como gate separado cuando exista el primer backup `READY`; nunca se restaura encima de `(default)`.

## 3. Budget productivo

El runner exige monto y thresholds explícitos. Un Cloud Billing budget es **alert-only**, no un hard cap.

Plan ejemplo:

```powershell
npm run phase-l:l2:budget-prod -- `
  --amount=500 `
  --thresholds=0.5,0.8,1
```

Apply guardado:

```powershell
npm run phase-l:l2:budget-prod -- `
  --amount=500 `
  --thresholds=0.5,0.8,1 `
  --apply `
  --confirm=CREATE-ATLAS-V4-PROD-L2-BUDGET
```

Los valores del ejemplo **no son defaults ni aprobación implícita**. El monto y thresholds deben aprobarse antes del apply.

El runner:

- scope exclusivamente `projects/atlasmap-prod`;
- no imprime billing account ID;
- no sobrescribe un budget existente distinto;
- usa periodo mensual y `CURRENT_SPEND`;
- no muta datos, IAM, Rules ni rollout.

## 4. Cost forecast

El budget no sustituye al forecast. El modelo de costos mantiene clasificación:

```text
simulation | measured | approved
```

No se declarará forecast productivo sin supuestos medidos o explícitamente aprobados (usuarios activos, viajes/sesiones, reads/writes, cache hit ratio, llamadas de proveedor, tamaño medio y retención).

## 5. Cierre L2

L2 requiere evidencia de:

- PITR enabled;
- backup schedule aprobado;
- al menos un backup `READY`;
- restore drill aislado PASS + cleanup;
- budget productivo;
- observabilidad productiva de costo/errores/latencia;
- forecast/baseline de costo aprobado o medido.
