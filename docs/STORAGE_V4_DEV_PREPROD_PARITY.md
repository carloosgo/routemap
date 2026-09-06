# Atlas Storage v4 — Dev as production-like preproduction

Fecha de revisión: **2026-09-03**

## Objetivo

`atlasmap-dev` es el entorno real de integración y preproducción mientras Atlas continúa recibiendo cambios de producto. Debe reproducir, cuando aporta valor, las mismas clases de infraestructura que producción sin usar `atlasmap-prod` para pruebas funcionales.

```text
local/emulators -> desarrollo y pruebas deterministas
atlasmap-dev    -> preprod real / integración cloud v4
atlasmap-prod   -> producción protegida
```

Preprod no es otra generación de storage ni otra rama de código. El runtime autenticado esperado en dev es **v4-only**.

## Contrato de paridad

La paridad buscada es funcional y operacional, no una copia literal de regiones o recursos:

- Firestore v4 real;
- tres Functions v4 canónicas;
- seis triggers Eventarc canónicos;
- Rules activas iguales al source canónico del repo;
- Google Authentication;
- recuperación y backups;
- observabilidad y presupuesto;
- Hosting estable cuando esté configurado;
- App Check/reCAPTCHA Enterprise cuando corresponda;
- TTL real en las colecciones internas que lo requieran;
- secretos privados únicamente server-side.

La región de dev puede diferir de producción si no rompe una prueba o requisito arquitectónico.

## Evidencia histórica y estado actual

Phase K dejó evidencia real en `atlasmap-dev` de Firestore, Functions, Eventarc, recovery, restore drill, observabilidad, alertas, budget, resiliencia, carga y sincronización. Esa evidencia demuestra que la arquitectura fue ejercitada en cloud.

No obstante, la fuente de verdad para saber qué está físicamente desplegado **hoy** es una verificación read-only del proyecto, no el snapshot histórico. En particular, documentos fechados que mencionan cinco triggers, Gate G, pilot, Remote Config o migraciones v3→v4 describen etapas anteriores y no el contrato actual.

## Stage v4

Ejecutar:

```powershell
npm run storage-v4:dev:verify
```

Debe verificar sin mutar cloud:

- target exactamente `atlasmap-dev`;
- las tres Functions v4 esperadas y sus regiones;
- los seis triggers Eventarc y su wiring;
- Rules activas idénticas a `firestore.rules`;
- producción fuera de alcance.

## Runtime + controles Phase K

Ejecutar:

```powershell
npm run storage-v4:dev:preprod-parity
```

Este preflight es read-only. Combina el contrato v4 del stage con los controles operacionales vigentes de dev. No usa Remote Config para seleccionar generación de storage, no crea cohortes y no habilita ningún modo pilot.

## Plataforma web y seguridad

Ejecutar:

```powershell
npm run storage-v4:dev:platform-parity
```

También es read-only. Inventaría:

- Delete Protection y PITR de Firestore;
- Firebase Web Apps y Google Auth;
- Firebase Hosting;
- APIs/registro de App Check y reCAPTCHA Enterprise;
- Secret Manager e Identity Toolkit;
- políticas TTL de las colecciones internas con expiración.

Devuelve gaps explícitos; no crea recursos para ocultar un gap.

## Hosting de preprod

El repo dispone de un flujo de Hosting exclusivamente para `atlasmap-dev`. Antes de publicar debe validar que el bundle contiene el proyecto de preprod y no contiene `atlasmap-prod`.

Un deploy de Hosting es una mutación cloud independiente del `git push`; requiere el flujo explícito correspondiente y no implica desplegar automáticamente Functions, Rules u otros recursos.

## App Check

Cuando exista una URL estable de preprod:

- usar reCAPTCHA Enterprise para la Web App de preprod;
- usar debug token únicamente para localhost cuando sea necesario;
- nunca versionar ni reutilizar debug tokens en producción;
- observar tráfico legítimo antes de enforcement;
- mantener enforcement como operación explícita y auditable.

## Regla de mutaciones

`atlasmap-dev` puede contener infraestructura real y datos de prueba, pero cada cambio remoto sigue siendo explícito. Antes de crear o modificar un recurso se inventaría primero; después del cambio se vuelve a verificar.

Nada en este documento autoriza tocar `atlasmap-prod`.

## Regla v4-only

No existen dos estados válidos de storage en preprod. El único estado funcional aceptable es v4. Si una verificación detecta dependencias de Gate G, pilot, hybrid, dual-write o v3, se trata como drift/deuda y se corrige; no se incorpora al nuevo procedimiento.
