# Atlas Storage v4 — Phase K alert delivery drill — 2026-08-14

## Resultado

**PASS — incidente real de Cloud Monitoring observado en `atlasmap-dev`.**

La ejecución controlada de:

```text
npm run phase-k:observability:alert-delivery-drill-dev -- --apply --confirm=RUN-ATLAS-V4-PHASE-K-ALERT-DRILL-DEV
```

produjo la siguiente cadena server-side:

```text
policy temporal creada
  -> señal sintética storage_v4_sync_metric escrita
  -> logs-based metric atlas_storage_v4_sync_events
  -> Cloud Monitoring abrió incidente
  -> notification channel permaneció asociado
  -> policy temporal eliminada en finally
```

### Evidencia observada

- project: `atlasmap-dev`
- drill id: `phase-k-alert-drill-006e3a5e`
- policy temporal: `projects/atlasmap-dev/alertPolicies/585442893147313324`
- señal: `event=flush`, `outcome=unexpected-error`
- incidente: `projects/atlasmap-dev/alerts/0.obfox9g5rsxe`
- estado observado: `OPEN`
- open time: `2026-08-14T20:47:46Z`
- metric type: `logging.googleapis.com/user/atlas_storage_v4_sync_events`
- notification channel asociado: `projects/atlasmap-dev/notificationChannels/13186104697776630379`
- cleanup: `temporaryPolicyDeleted=true`

## Límites de la evidencia

El drill confirma que la señal sintética entra a Logging, alimenta la métrica, satisface una condition temporal y abre un incidente de Cloud Monitoring asociado al canal configurado.

El runner reportó `emailReceiptVerifiedInBand=false`. Por tanto, **no se declara verificada la recepción humana del email**. La asociación del canal sí quedó probada server-side; la recepción de correo puede comprobarse fuera de banda si se desea, pero no es necesaria para demostrar el firing de Monitoring.

## Seguridad / alcance

El drill:

- no mutó datos de aplicación;
- no mutó budgets;
- no habilitó Storage v4 WRITE;
- no modificó las tres alert policies permanentes;
- no tocó producción;
- creó una única policy temporal;
- emitió una única señal sintética;
- eliminó la policy temporal en `finally`.

Dos intentos previos fallaron de forma segura y también limpiaron su policy temporal. El primero detectó un problema de transporte de `gcloud logging write` en Windows con rutas con espacios; el segundo detectó una petición incompatible al endpoint de incidentes. Ambos problemas fueron corregidos y cubiertos por tests antes de esta ejecución PASS.

## Conclusión

La evidencia de alert firing de Phase K en dev queda cerrada. Los thresholds permanentes siguen siendo configuración dev y no deben reinterpretarse como SLO productivo sin baseline real de rollout.