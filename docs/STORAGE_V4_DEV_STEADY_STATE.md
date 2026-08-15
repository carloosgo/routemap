# Atlas Storage v4 — Development steady state

Fecha: **2026-08-15**

## Objetivo actual

El rollout funcional de producción queda deliberadamente congelado mientras Atlas continúa recibiendo cambios de producto e implementación.

El entorno canónico para integración real es:

```text
project: atlasmap-dev
Firestore: real cloud dev database
Functions: real Cloud Functions dev deployment
Eventarc: real dev triggers
Remote Config: real dev template with explicit kill switch
Phase K recovery/observability/cost controls: real dev infrastructure
```

`atlasmap-prod` conserva únicamente la infraestructura productiva ya aprobada y aplicada. No se usa como entorno de desarrollo ni de prueba funcional.

## Estado productivo congelado

A la fecha de este documento:

- Firestore productivo permanece en `us-central1` con Delete Protection habilitado.
- PITR productivo está habilitado con ventana de 7 días.
- existe un backup schedule diario productivo con retención de 7 días.
- existe un budget productivo de 500 MXN con thresholds 50/80/100.
- Storage v4 READ productivo permanece deshabilitado.
- Storage v4 WRITE productivo permanece deshabilitado.
- L2 restore drill continúa pendiente de un backup `READY` y requiere autorización separada.
- L3 App Check está preparado pero no se registra ni se fuerza hasta disponer de dominio/hosting productivo real.
- L4-L7 no se ejecutan productivamente mientras este modo de trabajo esté vigente.

## Regla de desarrollo

Todo cambio nuevo debe avanzar en esta secuencia:

1. tests locales / emuladores;
2. integración contra `atlasmap-dev` cuando el cambio necesite infraestructura real;
3. verificación de stage y controles de Phase K;
4. experimentos o pilot únicamente en dev, con activación explícita;
5. volver a Remote Config fail-closed al terminar el bloque experimental;
6. producción permanece congelada hasta una decisión explícita de retomar Phase L.

## Preflight de steady state

Antes de comenzar un bloque importante que dependa de Firebase real, ejecutar:

```powershell
node scripts/runStorageV4DevSteadyState.mjs
```

El runner es estrictamente read-only y no admite argumentos, `--apply` ni `--confirm`.

Comprueba:

- que el target observado sea exactamente `atlasmap-dev`;
- Functions v4 esperadas activas y en las regiones esperadas;
- Eventarc esperado y válido;
- Firestore Rules dev coincidentes con el candidato aprobado del pilot;
- Remote Config dev en estado fail-closed antes de iniciar un nuevo bloque;
- Phase K consolidated cloud checkpoint: recovery/billing/telemetry, budget permissions, SLO sample, monitoring inventory y restore readiness;
- que el stage verificado declare `touchesProduction: false` y ninguna mutación de datos/cloud.

El runner aborta si cualquiera de esas invariantes deja de cumplirse.

## Uso de Remote Config en dev

El estado base entre bloques debe ser:

```text
storage_v4_enabled = false
storage_v4_kill_switch = true
storage_v4_mode = off
storage_v4_cohort_percent = 0
```

Si una implementación necesita tráfico v4 real en dev, se utiliza el runner existente de pilot con porcentaje explícito y confirmación explícita. Al terminar la prueba se vuelve a ejecutar el kill switch y después el preflight de steady state.

No se reutiliza esa activación para producción.

## Qué sí puede cambiar mientras este modo esté activo

- esquema y lógica v4 en el repo;
- Rules candidatas y sus tests;
- Functions y Eventarc de `atlasmap-dev`;
- migraciones, rollback, purge y materialización en datasets de dev controlados;
- telemetría y observabilidad dev;
- UI, UX, mapa, itinerario, gastos y nuevas funciones de producto;
- proveedores externos y sus capas de resiliencia;
- contratos y planners de futuras fases productivas.

Cada mutación cloud dev sigue usando sus confirmaciones existentes; este documento no convierte `continúa` en autorización genérica para cualquier operación mutante.

## Qué permanece fuera de alcance

Mientras el steady state esté vigente, no se debe:

- usar `atlasmap-prod` como backend de desarrollo;
- activar Storage v4 READ/WRITE productivo;
- crear cohortes productivas;
- registrar App Check con un dominio provisional;
- habilitar App Check enforcement productivo;
- ejecutar el restore drill productivo sin autorización específica;
- retirar v3 o iniciar convergencia productiva;
- copiar debug tokens, secretos o credenciales entre dev y prod.

## Retomar producción más adelante

Cuando el producto esté suficientemente estable y exista dominio/hosting definitivo:

1. volver a comprobar L2 y completar el restore drill pendiente;
2. retomar L3 con reCAPTCHA Enterprise + App Check en observation;
3. observar tráfico válido/inválido/missing;
4. reevaluar el gate L4;
5. seleccionar explícitamente la primera cohorte READ;
6. continuar L5-L7 sólo mediante sus gates respectivos.

Hasta entonces, `atlasmap-dev` es el entorno real de integración y `atlasmap-prod` es una base productiva protegida, no un entorno de experimentación.
