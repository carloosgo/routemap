# Atlas Storage v4 — Phase L3 App Check entry

Fecha: **2026-08-14**

Target productivo:

```text
project: atlasmap-prod
Web App: AtlasMap Web Production
Firestore: (default)
location: us-central1
```

L3 se prepara mientras L2 espera evidencia temporal de backups. No habilita Storage v4 READ/WRITE.

## Estado actual del código

- `functions/callablePolicy.js` declara `ENFORCE_APP_CHECK`, con default `false`.
- `BASE_CALLABLE_OPTIONS.enforceAppCheck` permanece explícitamente en `false`.
- `src/infrastructure/firebase/firebaseClient.js` **ya integra** `initializeAppCheck` + `ReCaptchaEnterpriseProvider`.
- el cliente habilita auto-refresh de tokens.
- la integración cliente permanece dormida cuando falta `VITE_FIREBASE_APPCHECK_SITE_KEY`, cuando se usan emuladores o fuera de `window`.
- `src/config.js` ya lee `VITE_FIREBASE_APPCHECK_SITE_KEY`.
- por lo tanto, **la integración de cliente está preimplementada, pero todavía no existe registro/enforcement productivo de App Check**.

## Proveedor

La implementación existente ya eligió **Firebase App Check + reCAPTCHA Enterprise**, que además coincide con la recomendación actual de Firebase para integraciones web nuevas.

No se necesita introducir reCAPTCHA v3.

## Preflight read-only

L3 dispone de un inventario cloud que no habilita APIs, no crea site keys, no registra App Check y no activa enforcement:

```powershell
npm run phase-l:l3:preflight-prod -- --check-cloud
```

Observa:

- Web App productiva esperada;
- estado de `firebaseappcheck.googleapis.com`;
- estado de `recaptchaenterprise.googleapis.com`;
- configuración reCAPTCHA Enterprise de App Check, únicamente cuando la API ya está habilitada;
- TTL/risk threshold si ya existieran, sin imprimir el valor de la site key.

## Orden de rollout L3

1. Resolver el dominio productivo que realmente servirá Atlas.
2. Crear/configurar una Website key de reCAPTCHA Enterprise para los dominios productivos aprobados.
3. Registrar `AtlasMap Web Production` en App Check con esa site key.
4. Inyectar `VITE_FIREBASE_APPCHECK_SITE_KEY` únicamente en el entorno/build productivo correspondiente; no hardcodearla en el código fuente.
5. Desplegar primero en modo **observation / unenforced**. El cliente ya empezará a enviar tokens porque la inicialización está implementada.
6. Observar solicitudes `VALID`, `INVALID` y `MISSING` en Firestore/Authentication/Functions.
7. No activar enforcement mientras haya una proporción material de tráfico legítimo `MISSING` o `INVALID` sin explicación.
8. Activar enforcement por producto de forma controlada solo después de evidencia PASS.
9. Mantener mecanismos de rollback separados para la variable/configuración cliente y para enforcement server-side.

## Decisiones que L3 no toma todavía

- dominio productivo final;
- site key concreta de reCAPTCHA Enterprise;
- TTL custom de App Check;
- threshold distinto al recomendado por Firebase;
- enforcement de Firestore, Authentication o Functions;
- debug tokens productivos.

Estas decisiones se toman cuando exista dominio productivo verificable y antes del primer rollout público.

## Invariantes

- no imprimir ni hardcodear valores de configuración innecesariamente en logs/código;
- no guardar debug tokens en repo;
- no autorizar `localhost` como dominio productivo;
- no activar enforcement antes de desplegar un build que envíe tokens y observar métricas;
- no convertir el flag `ENFORCE_APP_CHECK` en un switch global sin verificación por servicio;
- no abrir Firestore Rules por motivo de App Check;
- no habilitar Storage v4 WRITE durante L3.

## Gate de salida L3

L3 puede cerrarse cuando exista evidencia de:

- Web App registrada con App Check;
- build productivo enviando tokens mediante la integración cliente ya existente;
- métricas de observación suficientes para distinguir tráfico verificado/no verificado;
- rollback documentado;
- enforcement activado únicamente donde la evidencia confirme que no rompe tráfico legítimo, o decisión explícita de mantener observation durante L4 si el rollout lo requiere.
