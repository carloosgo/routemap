# Seguridad de Atlas

Fecha de revisión: **2026-09-03**

Este documento resume los controles vigentes del repositorio. Storage v4 es la única arquitectura autenticada soportada.

## Frontend

- React escapa contenido de texto por defecto; cualquier HTML manual debe sanearse explícitamente.
- El texto libre del usuario se normaliza/sanea según los contratos del dominio.
- `VITE_*` contiene únicamente configuración pública del cliente; nunca secretos backend.
- CSP y cabeceras de Hosting se mantienen restrictivas y se amplían solo para orígenes realmente consumidos.
- claves web públicas, como Google Maps, se restringen por HTTP referrer y APIs permitidas.

## Autenticación y autorización

- Firebase Authentication identifica al cliente autenticado.
- Firestore Rules aplican ownership/aislamiento por UID y validan el contrato v4.
- el cliente nunca puede leer/escribir viajes de otro UID;
- campos backend-owned y colecciones internas no son autoridad del navegador;
- no asumir que una Rules candidate del repo está desplegada: el estado remoto debe verificarse server-side.
- el uso sin sesión permanece en el repositorio local y no equivale a Firestore autenticado.

## Cloud Functions y proveedores

- claves privadas de Geoapify/Google usadas por Functions viven en Secret Manager;
- callables aplican autenticación, cuotas y validación mediante políticas compartidas;
- respuestas/fallos no exponen secretos, stack traces ni payloads sensibles;
- provider cache es server-side y no se expone directamente al frontend;
- cache/telemetría son fail-soft cuando el flujo puede continuar de forma segura.

## App Check

App Check se activa por observación, no por checklist:

1. registrar app/proveedor para el entorno correcto;
2. habilitar emisión de token en el cliente;
3. observar tráfico válido/missing/invalid;
4. confirmar dominio/Hosting y rollback;
5. aplicar enforcement solo después de evidencia suficiente.

Debug tokens son exclusivos de desarrollo y nunca se versionan ni reutilizan en producción.

## Firestore y Storage v4

- datos canónicos del usuario y datos derivados de proveedor permanecen separados;
- documentos temporales server-side usan freshness/TTL cuando corresponda;
- Delete Protection, PITR, backups y restore drills se administran por entorno;
- lifecycle/delete/purge siguen contratos explícitos e idempotentes;
- versionado/conflictos evitan sobrescritura silenciosa;
- no existen hybrid read, dual-write, fallback v3 ni selección de generación de storage como mecanismo de seguridad o rollback.

Si se detecta estado legacy inesperado en un entorno remoto, se bloquea la promoción y se inventaría; nunca se relajan Rules ni se restaura una arquitectura retirada solo para hacer pasar el flujo.

## Secretos y archivos locales

Nunca versionar:

- `.env`, `.env.local` o `functions/.env*` con valores reales;
- debug tokens de App Check;
- credenciales o service-account keys;
- copias de Secret Manager;
- logs/screenshots con secretos o datos sensibles.

Las claves dev y prod se administran independientemente.

## CI y dependencias

El corte entregable debe tener, sobre el mismo SHA:

- Quality Checks;
- tests/contratos y Firestore Rules;
- ESLint y build;
- CodeQL;
- Dependency Audit.

Eliminar un camino legacy implica eliminar sus contratos obsoletos sin reducir la cobertura de los caminos activos.

## Privacidad

Los viajes pueden contener fechas, ubicaciones, notas y gastos. Mantener minimización, aislamiento y eliminación. La telemetría operacional no debe contener UID, IDs de viaje/entidad, nombres, notas, búsquedas, coordenadas privadas ni payloads de mutación.

Requisitos regulatorios aplicables se tratan como requisitos de producto/operación, no solo como texto legal.

## Producción

- `atlasmap-dev` es integración/preproducción; `atlasmap-prod` no se usa para desarrollar o probar funcionalidades.
- toda mutación productiva requiere target explícito, procedimiento guardado y autorización correspondiente.
- la liberación productiva será directa sobre v4.
- rollback significa restaurar artefactos/configuración compatibles con v4; nunca volver a v3/hybrid/dual-write.
- antes de abrir tráfico se verifican recovery, Rules, Functions/Eventarc, App Check, observabilidad, costos y smokes.
- un `git push` o CI verde no demuestra que cloud esté desplegado con ese SHA.
