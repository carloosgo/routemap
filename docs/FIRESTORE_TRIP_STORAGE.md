# Firestore Trip Storage — v4-only

## Estado

Este documento describe la persistencia **operativa actual** de viajes autenticados en Atlas.

La arquitectura v2/v3 basada en `storageVersion`, `activeRevision` y `revisions/{revisionId}` fue retirada. No debe reintroducirse como camino paralelo ni utilizarse para nuevos guardados.

A nivel de dominio y UI, un viaje continúa tratándose como una unidad lógica. Físicamente, Firestore v4 persiste el root y sus entidades por separado para que un cambio pequeño no reescriba el viaje completo.

## Estructura canónica

Todo dato canónico del usuario permanece bajo su UID autenticado:

```text
users/{uid}/trips/{tripId}
  segments/{segmentId}
  places/{placeId}
  connections/{connectionId}
  notes/{noteId}
  checklist/{itemId}
```

No existe una subcolección `revisions` en el contrato v4.

## Root del viaje

`users/{uid}/trips/{tripId}` es un resumen versionado y materializado, no un contenedor del viaje completo.

Campos persistidos por el repositorio v4:

```text
id
name
currency
origin
originDetails
schemaVersion = 4
status
version
createdAt
updatedAt
deletedAt       cuando aplica
purgeAfter      cuando aplica
segmentCount
placeCount
connectionCount
noteCount
checklistCount
checklistDoneCount
startDate
endDate
```

`origin` usa el objeto `City` canónico del dominio; no se reduce a un string. El baseline local y la lectura remota deben conservar la misma representación estructurada para evitar mutaciones falsas del root.

Los agregados del root son derivados del backend. El cliente no debe tratarlos como autoridad editable.

## Entidades hijas

Cada entidad remota tiene identidad propia, `rank`, `version`, `status`, timestamps y un payload explícitamente limitado por tipo.

### Segment

```text
id
rank
city
cityRef
startDate
endDate
```

El tramo no persiste lugares ni resultados de routing dentro de su documento.

### Place

```text
id
rank
segmentId
sourceRef
name
kind
location
```

Sólo se persisten los campos canónicos permitidos. Payloads dinámicos o arbitrarios del proveedor no se copian al viaje.

### Connection

```text
id
rank
fromSegmentId
toSegmentId
mode
sourceRef
visibility
```

La conexión conserva intención e identidad persistible. Geometría, ETA, tráfico y respuestas volátiles del proveedor pertenecen a capas derivadas/cache cuando corresponda.

### Note

```text
id
rank
title
text
```

### Checklist item

```text
id
rank
text
done
```

## Versionado y concurrencia

Root y entidades hijas usan versiones enteras.

Las escrituras remotas se realizan con `expectedVersion` y `mutationId` dentro del contrato transaccional del repositorio. Una mutación basada en una versión remota obsoleta no debe sobrescribir silenciosamente el estado más reciente.

Los conflictos se conservan como estado explícito del pipeline local-first. Atlas no utiliza last-write-wins silencioso para datos canónicos del viaje.

## Guardado incremental y local-first

El límite normal de escritura es una entidad lógica, no el viaje completo y tampoco cada pulsación de tecla.

Flujo normal:

```text
edición en UI
  -> estado local inmediato
  -> persistencia durable local / IndexedDB
  -> dirty + mutation queue
  -> coalescing/scheduler
  -> intent v4 por entidad
  -> Firestore
  -> confirmación/versionado
  -> estado local clean
```

El autosave del editor usa la cola incremental v4. No debe convertirse otra vez en un `save()` remoto de viaje completo por debounce.

Una caída de red, un refresh o un fallo de telemetría no debe destruir trabajo pendiente del usuario ni bloquear un guardado que sí puede conservarse localmente.

## Lectura y reconstrucción

Para un usuario autenticado, el repositorio de aplicación usa Firestore v4 directamente. El root se lee primero y las subcolecciones se hidratan como entidades independientes; el modelo lógico `Trip` se reconstruye por encima de esa representación física.

Sin sesión se mantiene el repositorio local. Ese modo no constituye una segunda generación de Firestore ni un fallback v3.

## Eliminación y purge

La eliminación del viaje es lógica primero. El root deja de estar activo, conserva metadata de lifecycle y puede incluir `deletedAt` y `purgeAfter` hasta que el backend complete la limpieza física.

El purge es responsabilidad del backend y debe ser reintentable/idempotente. La UI no debe realizar borrado recursivo directo de las subcolecciones como mecanismo normal.

Las entidades hijas también usan estado/versionado en lugar de depender de una revisión global inmutable.

## Seguridad

- El dato canónico vive bajo `users/{uid}`.
- `firestore.rules` es la única fuente canónica de Rules de la aplicación.
- Las Rules forman parte del contrato de datos y se prueban con Emulator.
- El cliente no puede modificar campos backend-owned o saltarse el versionado permitido.
- App Check y las políticas de callable Functions complementan, pero no sustituyen, el aislamiento por UID y las Rules.
- Datos/cache de proveedores no se mezclan por conveniencia con el modelo canónico del usuario.

## Invariantes de mantenimiento

Al modificar persistencia v4:

1. no reintroducir `activeRevision`, `revisions/*`, Gate G, repositorio híbrido ni dual-write;
2. mantener el modelo lógico desacoplado de la forma física;
3. revisar IndexedDB, mutation queue, autosave, conflictos y lifecycle junto con cualquier cambio de schema;
4. actualizar Rules y sus tests cuando cambie el contrato de datos;
5. mantener escrituras por entidad y evitar whole-trip rewrites;
6. verificar que provider payloads no se conviertan accidentalmente en dato canónico;
7. ejecutar unit tests, Rules, lint, build y los workflows de seguridad antes de certificar el HEAD.
