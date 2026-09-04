# Atlas Storage v4 — historical operating snapshot — 2026-08-15

> **HISTÓRICO / NO OPERATIVO.** Este archivo conserva el estado observado el **2026-08-15** durante la transición hacia Storage v4. Desde septiembre de 2026, la arquitectura soportada es **v4-only** y este documento no debe utilizarse para decidir qué comandos, gates o mecanismos siguen vigentes.
>
> Fuentes actuales:
> - `docs/FIREBASE_FOUNDATION.md`
> - `docs/STORAGE_V4_IMPLEMENTATION_STATUS.md`
> - `docs/STORAGE_V4_DEV_STEADY_STATE.md`
> - `docs/STORAGE_V4_DEV_PREPROD_PARITY.md`
> - `docs/STORAGE_V4_OPERATIONS_RUNBOOK.md`
> - `docs/STORAGE_V4_PRODUCTION_ROLLOUT.md`

## Qué documentaba este snapshot

En agosto de 2026 Atlas todavía estaba validando la transición de storage. Por eso la evidencia de ese día incluía conceptos que posteriormente fueron retirados del runtime, como pilot, Remote Config de generación, migración/rollback y fases productivas de coexistencia.

Esos mecanismos se conservan aquí únicamente como contexto histórico: **no deben reactivarse**.

## Evidencia dev acumulada hasta 2026-08-15

`atlasmap-dev` había demostrado, entre otras cosas:

- Firestore real `(default)` en `northamerica-south1`;
- PITR de 7 días;
- backup diario con retención de 7 días;
- restore drill aislado y cleanup exitosos;
- 3 Cloud Functions v4 Node.js 22;
- Eventarc real con service account dedicada;
- Rules v4 verificadas;
- pruebas reales de lifecycle/purge;
- provider outage y sync flush E2E;
- carga cloud de 120 entidades hijas;
- reconnect 60/60 updates;
- simulaciones multidevice/contención;
- dashboard, logs-based metrics y alertas;
- budget dev de 500 MXN/mes con thresholds 50/80/100%.

Algunas cantidades de infraestructura de este snapshot, como el número de triggers Eventarc, representan el diseño de ese día y pueden diferir del manifest canónico actual. El contrato actual espera **6 triggers Eventarc**.

## Evidencia productiva acumulada hasta 2026-08-15

`atlasmap-prod` ya existía como proyecto separado y protegido. La evidencia de aquellas fases registró:

- proyecto/Firebase/billing activos;
- Firestore `(default)` Standard/Native en `us-central1`;
- Delete Protection;
- Web App productiva;
- Google Sign-In;
- otros providers de Auth deshabilitados;
- localhost no autorizado;
- Rules productivas cerradas durante el bootstrap;
- PITR/backup/budget preparados en fases posteriores documentadas.

Producción no se usaba como backend de desarrollo.

## Lo que cambió después

La transición terminó en el código soportado:

- v3 fue retirado del runtime;
- hybrid read y dual-write fueron retirados;
- Gate G/pilot dejaron de ser caminos operativos;
- Remote Config dejó de seleccionar la generación de storage;
- los planners productivos L4–L7 basados en coexistencia/migración fueron eliminados;
- la futura liberación productiva se redefinió como **release directo v4**.

Por ello, cualquier instrucción histórica que contradiga las fuentes actuales queda explícitamente superseded.

## Regla de uso

Este archivo puede citarse para responder “¿qué se había probado en agosto de 2026?”. No puede citarse para responder “¿qué debo ejecutar hoy?” ni para afirmar el estado físico cloud actual sin una nueva verificación read-only.
