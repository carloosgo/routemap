# Atlas Storage v4 — Phase K resilience evidence — 2026-08-11

Entorno de código: rama `agent/phase-3-firebase-foundation`.

Este documento separa deliberadamente **evidencia determinista de repositorio** de **evidencia E2E real**. Las simulaciones locales ayudan a cerrar comportamiento y regresiones, pero no sustituyen navegadores/dispositivos reales ni una degradación real/controlada del proveedor en `atlasmap-dev`.

## Suites deterministas existentes

### Provider request outage / telemetry safety

`functions/geoapifySupport.resilience.test.js` cubre la frontera HTTP antes del cache funcional:

- HTTP `429` se clasifica como `http-error`, conserva status y no se convierte silenciosamente en success;
- HTTP `503` se clasifica como `http-error` para una operación de routing;
- rechazo de red se clasifica como `network-error` con status `0`;
- JSON inválido con HTTP 200 se clasifica como `parse-error`;
- las métricas no contienen query, API key, URL completa ni mensaje de error de red;
- una falla del `metricSink` no transforma una respuesta válida del proveedor en error funcional.

Criterio arquitectónico cubierto: la observabilidad del proveedor es best-effort, preserva privacidad y clasifica correctamente degradaciones típicas sin convertirse ella misma en dependencia crítica.

### Provider cache fail-soft

`test/sharedProviderCacheResilience.test.js` cubre:

- fallo de lectura de cache sin impedir ejecutar el loader;
- fallo de escritura de cache sin convertir una respuesta válida del proveedor en fallo funcional;
- cache hit que evita una llamada innecesaria al loader;
- entrada expirada que vuelve a consultar y refresca el dato.

Criterio arquitectónico cubierto: una falla del cache temporal no puede derribar el editor ni transformar una respuesta válida de proveedor en error de usuario.

### Reconnect storm

`test/storageV4ReconnectionStorm.test.js` simula 1,000 clientes que recuperan conectividad y valida:

- jitter distribuido antes del primer intento;
- ausencia de reconexión inmediata masiva en `t=0`;
- todos los clientes terminan sincronizados;
- el número de intentos permanece acotado bajo el escenario determinista.

Criterio arquitectónico cubierto: el backoff/jitter evita un thundering herd determinista al recuperar conectividad.

### Multidevice conflict

`test/storageV4MultiDeviceSimulation.test.js` simula dos clientes partiendo de la misma versión de entidad y valida:

- una escritura gana mediante versionado optimista;
- la segunda detecta `version-mismatch` en lugar de sobrescribir silenciosamente;
- la edición perdedora queda preservada explícitamente para resolución posterior;
- no existe pérdida silenciosa de datos.

Criterio arquitectónico cubierto: v4.0 resuelve conflicto a nivel entidad y no implementa merge complejo campo-a-campo.

## Comando agregado

El repositorio expone:

```bash
npm run phase-k:resilience:local
```

Ese comando ejecuta las cuatro suites anteriores y sirve como smoke determinista de resiliencia para Phase K.

## Lo que esta evidencia NO cierra

Siguen pendientes antes de cerrar Phase K:

- provider outage E2E en `atlasmap-dev` con timeout/429/5xx controlados y evidencia de UX/local state;
- dos pestañas reales del mismo usuario;
- dos dispositivos/navegadores reales del mismo usuario;
- reconnect E2E con tráfico real de Functions/Firestore;
- medición de p50/p95/p99 y SLO bajo carga representativa;
- validación de que alertas/dashboard reflejan correctamente esos escenarios una vez aplicados en Cloud Monitoring.

No declarar estos pendientes como PASS a partir de las simulaciones locales.
