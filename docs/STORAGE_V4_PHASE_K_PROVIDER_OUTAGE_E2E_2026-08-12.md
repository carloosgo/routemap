# Atlas Storage v4 — Phase K provider outage E2E — 2026-08-12

Entorno: `atlasmap-dev`

Este checkpoint registra la prueba E2E real de outage sintético del proveedor en desarrollo. No autoriza producción, Storage v4 WRITE, budgets, alert policies ni migración.

## Objetivo

Validar de extremo a extremo que una falla de red de proveedor:

- atraviesa el runtime real de `limitedFetch`;
- se clasifica como `network-error`;
- genera la métrica estructurada esperada en Cloud Logging;
- puede verificarse usando una función Gen2 privada y una invocación autenticada;
- no necesita usar el endpoint productivo de Geoapify ni su API key.

## Probe desplegado

Función:

- nombre: `storageV4ProviderOutageProbe`;
- región: `us-central1`;
- generación: Gen2;
- runtime de prueba: `limitedFetch` real;
- destino sintético: loopback no disponible (`127.0.0.1:65534`);
- proveedor lógico: `geoapify`;
- operación lógica: `geocode-search`;
- sin `GEOAPIFY_API_KEY`;
- `maxInstances=1`;
- `concurrency=1`;
- declarada con `invoker: 'private'`.

El primer `--apply` terminó correctamente el deploy, pero la verificación posterior falló por el transporte de `gcloud` bajo Windows. La función sí quedó desplegada. El runner fue endurecido para separar despliegue de verificación y evitar un redeploy innecesario.

## Runner endurecido

`runStorageV4PhaseKProviderOutageE2EDev.mjs` ahora soporta `--verify-existing`.

En ese modo:

- omite completamente Firebase deploy;
- obtiene únicamente tokens desde la sesión local autenticada de `gcloud`;
- consulta Cloud Functions Gen2 mediante Google Cloud REST;
- consulta IAM del servicio Cloud Run mediante REST;
- aborta si encuentra `allUsers` o `allAuthenticatedUsers` como invocadores;
- aborta si el IAM invoker check aparece deshabilitado;
- invoca la función existente con identity token;
- consulta Cloud Logging mediante REST;
- exige al menos un `storage_v4_provider_request_metric` con `provider=geoapify`, `operation=geocode-search` y `outcome=network-error`.

Esto elimina la dependencia de comandos `gcloud` complejos con filtros/comillas/redirecciones susceptibles a `cmd.exe` en Windows.

## Evidencia observada — PASS

Ejecución local:

```text
npm run phase-k:e2e:provider-outage-dev -- --verify-existing
```

Plan observado:

- `project=atlasmap-dev`;
- `region=us-central1`;
- `applyRequested=false`;
- `verifyExistingRequested=true`;
- `deploymentSkipped=true`;
- `invokesProbeExactlyOnce=true`;
- `verifiesCloudLoggingMetric=true`;
- `cloudVerificationTransport=google-cloud-rest`;
- `usesProductionProviderEndpoint=false`;
- `usesProviderApiKey=false`;
- `mutatesApplicationData=false`;
- `mutatesBudgets=false`;
- `changesAlertPolicies=false`;
- `enablesStorageV4Write=false`;
- `touchesProduction=false`.

Resultado final observado:

- `verifiedExisting=true`;
- `providerOutageE2EPassed=true`;
- `synthetic=true`;
- `probeFunctionState=ACTIVE`;
- `probeFunctionGeneration=GEN_2`;
- `probeFunctionPrivate=true`;
- `provider=geoapify`;
- `operation=geocode-search`;
- `observedOutcome=network-error`;
- `matchingProviderMetricLogCount=1`;
- `providerApiKeyUntouched=true`;
- `applicationDataUntouched=true`;
- `alertPoliciesUntouched=true`;
- `budgetsUntouched=true`;
- `storageV4WriteUnchanged=true`;
- `productionUntouched=true`.

## Conclusión

**Provider outage E2E de Phase K: CLOSED / PASS en `atlasmap-dev`.**

La evidencia ya no es únicamente determinista/local: existe una invocación Cloud real, una falla de red sintética procesada por el runtime real, privacidad desplegada verificada y un evento estructurado confirmado en Cloud Logging.

Este PASS no representa capacidad, load test, reconnect masivo, multi-device ni un SLO productivo. Esos checkpoints permanecen separados.
