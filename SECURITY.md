# Seguridad de Atlas

Este documento resume los controles vigentes del repositorio. Los runbooks y closeouts de Storage v4 contienen los detalles operativos por entorno.

## Frontend

- React escapa contenido de texto por defecto; cualquier HTML manual debe sanearse/escaparse explícitamente.
- El texto libre del usuario se normaliza/sanea antes de persistirse según los contratos del dominio.
- `VITE_*` contiene únicamente configuración pública del cliente. **Nunca** guardar secretos backend en variables Vite.
- La Content-Security-Policy y las cabeceras de Hosting deben mantenerse restrictivas y actualizarse únicamente para orígenes realmente consumidos.
- Las claves web públicas (por ejemplo Google Maps) deben restringirse por HTTP referrer y APIs autorizadas.

## Autenticación y autorización

- Firebase Authentication es la identidad del cliente autenticado.
- Firestore Rules aplican ownership/aislamiento por usuario y validan los contratos v4 antes de permitir acceso cliente.
- Las Rules productivas se abren por gates de rollout; no asumir que una Rules candidate en el repo está desplegada.
- Los viajes locales de usuarios no autenticados permanecen en `localStorage` y no equivalen a datos autenticados de Firestore.

## Cloud Functions y proveedores

- Las claves privadas de Geoapify/Google usadas por Functions viven en Firebase Secret Manager.
- Las callables aplican autenticación/cuotas/validación mediante las políticas compartidas del backend.
- Las respuestas y fallos no deben exponer secretos, stack traces internos ni payloads sensibles de proveedor.
- El acceso a provider cache es server-side mediante la frontera `cacheDb`; el frontend no accede directamente a una database de caché.
- La caché es fail-soft: una falla de lectura/escritura de caché no debe bloquear el editor si el proveedor/flujo puede continuar de forma segura.

## App Check

App Check se trata como un control gradual, no como un interruptor que se habilita a ciegas:

1. registrar/configurar la app y proveedor correspondientes;
2. habilitar capacidad de token en el cliente;
3. observar tráfico válido/inválido;
4. confirmar dominio/Hosting y rollback;
5. aplicar enforcement únicamente cuando el gate lo autorice.

No habilitar enforcement para “completar checklist” si la observación previa o el dominio definitivo no están listos.

## Firestore y Storage v4

- Datos canónicos del usuario y datos temporales de proveedores mantienen fronteras lógicas distintas.
- Documentos temporales server-side usan `expiresAt` y políticas TTL administradas; la aplicación valida frescura y no depende de la velocidad de borrado físico del TTL.
- Delete Protection, PITR, backups y restore drills se gestionan por runners explícitos y por entorno.
- El borrado lógico/purge y los mecanismos de migration/rollback no se ejecutan en producción sin el gate y autorización correspondientes.
- No introducir dual-write permanente como sustituto de una migración controlada.

## Secretos y archivos locales

Nunca versionar:

- `.env`, `.env.local` o `functions/.env*` con valores reales;
- debug tokens de App Check;
- salidas de consola que puedan contener información sensible;
- credenciales, service-account keys o copias de Secret Manager;
- configuración local específica de herramientas que no forme parte del producto.

Los secretos se crean/rotan en el gestor correspondiente y no deben copiarse a documentación, issues o screenshots.

## CI y dependencias

El workflow `Quality checks` ejecuta unit tests, Firestore Rules, Phase-K E2E Rules, ESLint y build. El repositorio también mantiene análisis de dependencias/código en GitHub.

Un cambio de Rules, persistencia, cache o backend debe conservar sus tests de contrato. Eliminar un camino legacy implica eliminar sus contratos obsoletos, pero no la cobertura de los caminos que siguen activos.

## Privacidad y datos del usuario

Los viajes pueden contener fechas, ubicaciones, notas y gastos. El diseño debe mantener minimización de datos, aislamiento por usuario y mecanismos de eliminación. Los requisitos regulatorios (por ejemplo GDPR/CCPA cuando correspondan) deben tratarse como requisitos de producto/operación, no sólo como texto legal.

## Producción

- `atlasmap-dev` es el entorno de integración/preproducción; no usar `atlasmap-prod` como backend de desarrollo.
- Toda mutación productiva requiere el runner/gate apropiado y autorización explícita cuando el procedimiento lo exige.
- Remote Config, kill switches y Rules forman parte del rollback; no retirarlos antes de la convergencia definida en Phase L.
- Antes de ampliar READ/WRITE productivo se deben revisar métricas, errores, latencia, recovery y costo del gate correspondiente.
