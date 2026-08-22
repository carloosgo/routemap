# Almacenamiento escalable de viajes en Firestore

## Objetivo

Evitar que un viaje completo dependa de un único documento y se acerque al límite de tamaño de Firestore a medida que crecen sus tramos, lugares, notas y checklist.

## Estructura

El documento principal contiene únicamente metadatos y datos necesarios para listar viajes:

```text
users/{uid}/trips/{tripId}
```

Campos principales:

- `id`, `name`, `currency`
- `createdAt`, `updatedAt`
- `storageVersion: 2`
- `activeRevision`
- conteos de tramos, lugares, notas y checklist
- total monetario resumido

El contenido completo se guarda dentro de una revisión inmutable:

```text
users/{uid}/trips/{tripId}/revisions/{revisionId}
users/{uid}/trips/{tripId}/revisions/{revisionId}/segments/{position}
users/{uid}/trips/{tripId}/revisions/{revisionId}/places/{position}
users/{uid}/trips/{tripId}/revisions/{revisionId}/notes/{position}
users/{uid}/trips/{tripId}/revisions/{revisionId}/checklist/{position}
```

## Protocolo de guardado

1. Se crea una revisión con `complete: false`.
2. Se escriben sus elementos en lotes limitados.
3. La revisión cambia a `complete: true` y queda inmutable.
4. El documento principal cambia `activeRevision` a la revisión completa.
5. Las revisiones anteriores se eliminan como limpieza posterior.

El documento principal nunca apunta a una revisión incompleta. Una interrupción durante los pasos 1 o 2 conserva intacta la versión publicada anteriormente.

## Lectura

- La lista de viajes consulta únicamente documentos principales ligeros.
- El contenido completo se carga bajo demanda cuando el usuario abre un viaje.
- Los elementos se ordenan mediante el campo `position` antes de reconstruir el modelo normalizado.

## Compatibilidad y migración

Los documentos antiguos que contienen arreglos completos siguen siendo legibles. En el siguiente guardado se escriben automáticamente con `storageVersion: 2`; no se requiere una migración manual ni un proceso masivo.

## Eliminación

Primero se elimina el documento principal para retirar inmediatamente el viaje de la lista. Después se limpian sus revisiones. Una interrupción en la limpieza puede dejar documentos huérfanos temporales, pero nunca un viaje visible apuntando a datos parcialmente eliminados.

## Reglas de seguridad

- Solo el propietario puede leer o escribir su viaje y sus revisiones.
- Una revisión solo acepta elementos mientras está abierta.
- Después de marcarla completa, no puede reabrirse ni modificarse.
- El documento principal solo puede apuntar a una revisión completa.
- Los límites máximos del modelo se validan tanto en el cliente como en las reglas.
