# Atlas Storage v4 — Phase J provider-cache decision

Fecha: **2026-08-14**

## Decisión

Phase J queda **cerrada para v4.0** con esta topología:

- los datos canónicos del usuario permanecen separados de datos temporales/derivados de proveedores por contrato y por `cacheDb`;
- TTL, freshness, provider policy y comportamiento ante outage permanecen obligatorios;
- no se crea ni se hace depender el rollout de una base física `atlas-cache` mientras el acceso named-database requerido por Firebase Admin Node siga marcado como Public Preview/no-production;
- la separación física se considera una mejora posterior, no un requisito bloqueante de v4.0.

## Motivo

Firestore soporta múltiples databases por proyecto y permite usar named databases como mecanismo de aislamiento. Sin embargo, la referencia oficial de Firebase Admin Node consultada el 2026-08-14 sigue marcando `getFirestore(databaseId)`, `getFirestore(app, databaseId)` e `initializeFirestore(..., databaseId)` como **Public Preview** e indica no utilizar ese acceso en producción.

Forzar `atlas-cache` físico ahora introduciría una dependencia productiva sobre una API que el propio proveedor aún declara no apta para producción. Eso empeora el riesgo arquitectónico en lugar de reducirlo.

## Contrato v4.0

La decisión de defer no permite mezclar cache de proveedor con documentos canónicos.

Se mantiene como requisito:

1. el storage canónico no persiste payloads temporales completos de Google/Geoapify como parte del viaje;
2. todo dato cacheable de proveedor pasa por la abstracción `cacheDb`/provider cache;
3. freshness y TTL determinan si un valor derivado puede reutilizarse;
4. un fallo/outage del proveedor no puede corromper el viaje canónico;
5. el backend debe poder reemplazar la implementación física de `cacheDb` sin cambiar el contrato del dominio.

## Evidencia ya existente

En dev ya están cubiertos el contrato de cache, TTL/freshness, provider policy, telemetría de cache/request y el escenario Provider Outage E2E. Por lo tanto, la parte funcional de J no depende de crear una segunda database.

## Trigger para reabrir la separación física

Reevaluar `atlas-cache` físico cuando ocurra cualquiera de estas condiciones:

- Firebase Admin Node deje de marcar named-database access como preview/no-production;
- se apruebe otra biblioteca server-side estable que permita el aislamiento sin degradar seguridad, observabilidad o mantenimiento;
- una necesidad real de escala, retención, billing o aislamiento justifique una topología independiente.

La reevaluación debe incluir Rules/IAM, backup/recovery, observabilidad, costo y migración de cache; nunca debe convertirse en una migración de datos canónicos de viajes.

## Resultado

**Phase J: CLOSED FOR V4.0 — logical separation enforced, physical named database deferred by provider production-safety constraint.**

Esta decisión no cambia producción, no crea databases y no habilita Storage v4 writes.
