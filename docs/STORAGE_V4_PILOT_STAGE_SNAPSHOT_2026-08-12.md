# Atlas Storage v4 — pilot stage snapshot (dev)

Fecha: 2026-08-12
Proyecto: `atlasmap-dev`
Branch: `agent/phase-3-firebase-foundation`

## Resultado

El preflight read-only del stage pilot Storage v4 produjo un snapshot válido y fail-closed.

Comando ejecutado:

```powershell
npm run storage-v4:pilot-stage-safety-dev
```

Evidencia observada:

- `mode`: `snapshot`
- `releaseName`: `projects/atlasmap-dev/releases/cloud.firestore`
- `originalRulesetName`: `projects/atlasmap-dev/rulesets/cd99a504-01c0-45dc-8875-cb9183d7698b`
- `originalSourceSha256`: `5f7d4e5adbc1e1751bc800f0cc692f77ce8aa5234ab043342ef4266a4ced71f2`
- `candidateSourceSha256`: `a41792990264c765867e90c03ee4998448c838f10d23631e1b9863d6ad679062`
- `remoteConfigSafeOff`: `true`
- `mutatesCloud`: `false`
- `activatesClientPilotTraffic`: `false`
- `touchesProduction`: `false`

## Interpretación

El estado previo al stage quedó identificado de forma determinista por Ruleset ID + SHA-256, y el Ruleset candidato quedó identificado por un SHA-256 independiente.

Remote Config continúa fail-closed: el snapshot no activó tráfico pilot, no cambió Functions, no cambió Firestore Rules, no escribió datos de aplicación y no tocó producción.

Este snapshot es la referencia aprobable para recovery si el stage posterior quedara parcialmente aplicado. El recovery debe rechazar cualquier tercer estado cuyo Ruleset/SHA no coincida con el original o con el candidato registrado aquí.

## Límite de autorización

El siguiente comando `storage-v4:pilot-stage-deploy-dev -- --apply ...` sí materializa las Functions pilot y despliega las Rules candidatas de WRITE v4 en `atlasmap-dev`. Aunque Remote Config permanezca en 0%/OFF y no se active tráfico cliente, ese paso cambia infraestructura Cloud y habilita técnicamente el Ruleset v4 candidato.

Por la política del proyecto, ese apply requiere autorización explícita antes de ejecutarse.
