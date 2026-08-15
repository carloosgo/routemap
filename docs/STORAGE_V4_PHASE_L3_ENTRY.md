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
- el frontend todavía no inicializa `firebase/app-check`.
- por lo tanto, **no existe enforcement productivo de App Check en este momento**.

## Proveedor elegido para la preparación

Para la Web App productiva, la vía objetivo es **Firebase App Check + reCAPTCHA Enterprise**.

No se usará reCAPTCHA v3 para una integración nueva salvo decisión posterior explícita.

## Orden de rollout L3

1. Crear/configurar una Website key de reCAPTCHA Enterprise para los dominios productivos aprobados.
2. Registrar `AtlasMap Web Production` en App Check con esa site key.
3. Añadir `firebase/app-check` al cliente e inicializarlo antes del acceso a servicios Firebase.
4. Desplegar primero en modo **observation / unenforced**.
5. Observar solicitudes `VALID`, `INVALID` y `MISSING` en Firestore/Authentication/Functions.
6. No activar enforcement mientras haya una proporción material de tráfico legítimo `MISSING` o `INVALID` sin explicación.
7. Activar enforcement por producto de forma controlada solo después de evidencia PASS.
8. Mantener mecanismos de rollback separados para cliente y enforcement.

## Decisiones que L3 no toma todavía

- dominio productivo final;
- site key concreta de reCAPTCHA Enterprise;
- TTL custom de App Check;
- threshold distinto al recomendado por Firebase;
- enforcement de Firestore, Authentication o Functions;
- debug tokens productivos.

Estas decisiones se toman cuando exista dominio productivo verificable y antes del primer rollout público.

## Invariantes

- no imprimir site keys/credenciales privadas innecesarias en logs;
- no guardar debug tokens en repo;
- no autorizar `localhost` como dominio productivo;
- no activar enforcement antes de desplegar el SDK cliente y observar métricas;
- no convertir el flag `ENFORCE_APP_CHECK` en un switch global sin verificación por servicio;
- no abrir Firestore Rules por motivo de App Check;
- no habilitar Storage v4 WRITE durante L3.

## Gate de salida L3

L3 puede cerrarse cuando exista evidencia de:

- Web App registrada con App Check;
- cliente productivo enviando tokens;
- métricas de observación suficientes para distinguir tráfico verificado/no verificado;
- rollback documentado;
- enforcement activado únicamente donde la evidencia confirme que no rompe tráfico legítimo, o decisión explícita de mantener observation durante L4 si el rollout lo requiere.
