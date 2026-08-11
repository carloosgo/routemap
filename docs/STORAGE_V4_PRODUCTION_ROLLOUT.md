# Storage v4 — Phase L production rollout

Este runbook prepara Phase L del roadmap original. No autoriza por sí mismo ningún cambio remoto en producción.

## Principios

- proyecto Firebase de producción separado de desarrollo;
- región/ubicación decididas antes de crear datos productivos;
- v4 se prepara directamente en producción, sin crear una deuda permanente de esquema v3 nuevo;
- cada cambio remoto tiene rollback explícito;
- READ precede a cualquier escritura v4;
- no existe salto directo a 100%;
- el cliente nunca obtiene acceso directo a colecciones internas ni provider cache;
- App Check se observa antes de enforcement;
- backups/restore drill y budgets existen antes de ampliar tráfico.

## Gate L0 — proyecto y ubicación

Requerido antes de desplegar:

- proyecto Firebase producción creado y facturación validada;
- Auth/Google provider configurado;
- dominios autorizados definidos;
- Firestore `(default)` creado en ubicación aprobada;
- Functions desplegables en región alineada con la arquitectura;
- Secret Manager preparado;
- Remote Config preparado fail-closed;
- decisión documentada sobre `atlas-cache` y su acceso server-side;
- CSP/hosting/dominios productivos definidos.

No copiar secretos de dev de forma informal. Crear versiones productivas administradas.

## Gate L1 — seguridad y datos

Antes de tráfico usuario:

- Rules v4/rollout pasan Emulator;
- ownership probado con dos usuarios;
- escrituras directas v4 cliente bloqueadas cuando el modo no las autoriza;
- colecciones internas bloqueadas;
- provider cache bloqueado a cliente;
- índices revisados;
- campos grandes/no consultables excluidos de indexación cuando corresponda;
- server timestamps protegidos;
- límites de tamaño/shape activos;
- soft delete/tombstones/purge revisados.

## Gate L2 — recovery y costo

Antes del primer rollout:

- PITR configurado;
- backup schedule y retención configurados;
- restore drill ejecutado a base aislada;
- budget productivo configurado;
- alertas de gasto/errores/latencia verificadas;
- dashboard Storage v4 disponible;
- baseline de costos registrado.

## Gate L3 — App Check observación

1. registrar app y dominios productivos;
2. desplegar cliente con App Check habilitado para obtener tokens;
3. mantener enforcement backend desactivado;
4. observar proporción de requests válidos/missing/invalid;
5. corregir clientes legítimos antes de enforcement;
6. activar enforcement por superficie en una ventana controlada;
7. conservar rollback inmediato.

No reutilizar el patrón `BooleanParam` en `enforceAppCheck` mientras el runtime de Functions desplegado no soporte explícitamente ese tipo de opción. El comportamiento debe validarse con la versión real instalada antes de cambiar enforcement.

## Gate L4 — READ productivo

Usar el mismo contrato fail-closed validado en Gate G:

```text
storage_v4_enabled            false
storage_v4_kill_switch        true
storage_v4_mode               off
storage_v4_cohort_percent     0
storage_v4_read_rules_ready   false
```

Secuencia:

1. verificar Remote Config realtime en producción sin activar READ;
2. verificar telemetría sin PII;
3. desplegar Rules READ candidatas;
4. comprobar CRUD v3 controlado;
5. activar una cohorte READ pequeña;
6. observar latencia/error/schema mix;
7. ampliar gradualmente solo con ventana estable;
8. rollback remoto ante anomalía.

El PASS técnico de `atlasmap-dev` no sustituye esta validación productiva.

## Gate L5 — materialización/migración

La migración mantiene v3 canónico mientras materializa v4 y verifica paridad.

Para cada batch:

- registrar checkpoint/estado;
- materializar de forma idempotente;
- verificar roots/entidades/agregados;
- registrar diferencias sin contenido sensible;
- no cortar v3 por el solo hecho de haber escrito v4;
- permitir rollback/reintento antes de marcar el batch verificado.

No mantener dual-write permanente.

## Gate L6 — escritura v4 controlada

Es un checkpoint separado de READ.

Antes de habilitar:

- Rules de write verificadas;
- runtime de Sync Coordinator conectado deliberadamente;
- first-save/autosave revisados;
- IndexedDB + mutation queue probados;
- version mismatch probado multidevice;
- child tombstones/delete reconciler probado;
- agregados server-side idempotentes probados;
- purge probado sin doble decremento;
- rollback a modo sin write documentado.

Comenzar con cohorte mínima y observar.

## Gate L7 — convergencia

Solo cuando la evidencia muestre que los datos v4 son canónicos y completos:

- dejar de depender de materialización v3;
- retirar dual-read de forma gradual;
- conservar compatibilidad/rollback durante la ventana aprobada;
- eliminar código legado únicamente cuando no exista tráfico/dato que lo necesite;
- actualizar Rules e índices después de demostrar que no rompen clientes soportados.

## Criterio de cierre de Phase L

Phase L se considera cerrada cuando:

- producción opera con el storage v4 canónico;
- no hay dual-write permanente;
- migración verificada y rollback cerrado;
- READ/write v4 cumplen SLO;
- backup/restore está probado;
- App Check enforcement está estable;
- budgets/alertas/dashboard están activos;
- provider cache está aislado según la topología aprobada;
- no existe pérdida silenciosa de datos en pruebas multidevice/offline;
- el camino v3 restante está retirado o tiene una fecha/condición explícita de retiro.