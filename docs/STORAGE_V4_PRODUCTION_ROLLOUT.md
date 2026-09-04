# Storage v4 — Production release

Fecha de revisión: **2026-09-03**

Este runbook define cómo llevar Atlas a `atlasmap-prod` desde la arquitectura actual **Storage v4-only**. No autoriza por sí mismo ninguna mutación remota.

## Principio central

Producción no realizará una migración funcional v3→v4. El software soportado ya es v4-only, por lo que la futura salida productiva será un **release directo de v4**.

Quedan prohibidos como estrategia de release:

- reactivar Gate G;
- seleccionar storage por Remote Config;
- cohortes v3/v4;
- hybrid read;
- dual-write v3/v4;
- materializar v3 como paso normal de producción;
- rollback de arquitectura hacia v3.

Si un inventario productivo encuentra datos o dependencias legacy inesperadas, se detiene el release y se investiga. No se resuelve reintroduciendo caminos retirados.

## Entorno productivo

Target explícito:

```text
Firebase/GCP project: atlasmap-prod
Firebase alias: prod
```

Nunca usar el alias `default` para un runner productivo. `default` pertenece a `atlasmap-dev`.

## Gate P0 — inventario y protección

Antes de cualquier release:

- proyecto `atlasmap-prod` ACTIVE y billing válido;
- Firestore `(default)` en la ubicación productiva aprobada;
- Delete Protection habilitado;
- Web App/Auth inventariados;
- Rules actuales leídas server-side;
- Functions/Eventarc/Hosting/App Check inventariados;
- datos/colecciones top-level inventariados;
- secretos productivos administrados por separado de dev;
- ninguna dependencia de storage legacy detectada.

Todo preflight debe ser read-only.

## Gate P1 — recovery, costos y observabilidad

Antes de abrir tráfico:

- PITR configurado;
- backup schedule y retención configurados;
- al menos un backup utilizable observado;
- restore drill a una base nueva y aislada completado cuando corresponda;
- budget productivo y thresholds confirmados;
- alertas y dashboard revisados;
- baseline/forecast de costo documentado con supuestos explícitos.

Nunca restaurar sobre `(default)` durante un drill.

## Gate P2 — plataforma web y App Check

Antes de enforcement:

1. dominio/Hosting productivo definitivo;
2. Web App productiva correcta;
3. reCAPTCHA Enterprise registrado para el dominio productivo;
4. cliente emitiendo tokens App Check;
5. observación de tráfico válido/missing/invalid;
6. enforcement únicamente después de evidencia suficiente;
7. rollback de enforcement preparado.

Los debug tokens de dev/localhost nunca se reutilizan en producción.

## Gate P3 — candidato v4 coherente

El candidato productivo debe ser un conjunto coherente y certificado:

- frontend v4-only;
- `firestore.rules` canónicas v4;
- índices requeridos;
- Functions v4 canónicas;
- Eventarc canónico;
- secretos/provider configuration productivos;
- Hosting/build apuntando únicamente a `atlasmap-prod`;
- App Check policy acorde al gate aprobado.

El código debe haber pasado Quality, CodeQL y Dependency Audit sobre el mismo SHA antes de promoverlo.

## Gate P4 — despliegue controlado

El deploy se divide por superficies para conservar rollback operacional y evidencia:

1. confirmar inventario inmediatamente antes del cambio;
2. desplegar únicamente las superficies explícitamente autorizadas;
3. comprobar server-side que cada recurso quedó en la versión esperada;
4. ejecutar smokes de Auth, lectura, creación/edición y lifecycle con datos controlados;
5. comprobar errores, latencia, sync, Eventarc y observabilidad;
6. abrir tráfico únicamente cuando el estado remoto sea coherente.

Un `git push` nunca equivale a deploy.

## Rollback permitido

El rollback productivo puede restaurar:

- un artefacto/frontend anterior compatible con v4;
- una versión anterior de Functions compatible con el contrato v4;
- Rules v4 anteriores conocidas y verificadas;
- enforcement/configuración de plataforma cuando exista un procedimiento aprobado.

El rollback **no** puede cambiar la generación de persistencia a v3 ni activar hybrid/dual-write. Si no existe un artefacto v4 compatible para volver atrás, se cierra tráfico o se mitiga la superficie afectada antes de improvisar una segunda arquitectura.

## Datos productivos

La fuente canónica de viajes productivos será exclusivamente el contrato v4:

```text
users/{uid}/trips/{tripId}
  segments/{segmentId}
  places/{placeId}
  connections/{connectionId}
  notes/{noteId}
  checklist/{itemId}
```

El root contiene identidad/resumen/origin/lifecycle/versionado/agregados conforme al contrato vigente. No existen `activeRevision` ni `revisions/{revisionId}` como almacenamiento operativo.

## Criterio de salida a tráfico

Producción puede considerarse abierta solo cuando:

- infraestructura y datos observados coinciden con el contrato v4-only;
- recovery está operativo;
- Rules y aislamiento por UID están verificados;
- Functions/Eventarc están sanos;
- App Check está en el estado aprobado;
- observabilidad y budgets están activos;
- no existe pérdida silenciosa en pruebas offline/multidevice;
- el frontend productivo apunta exclusivamente a `atlasmap-prod`;
- no existe ningún mecanismo operativo que seleccione v3/v4.

## Evidencia histórica

Los documentos fechados de las antiguas fases L4–L7 conservan valor de auditoría sobre el proceso de construcción de Storage v4. No son runbooks actuales y no deben ejecutarse para liberar la aplicación actual.
