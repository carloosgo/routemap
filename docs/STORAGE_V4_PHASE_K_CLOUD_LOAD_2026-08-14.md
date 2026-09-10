# Atlas Storage v4 — Phase K cloud load/reconnect evidence

Fecha: **2026-08-14**
Entorno: **`atlasmap-dev`**
Producción: **no tocada**

## Resultado

El runner controlado `phase-k:e2e:cloud-load-dev` terminó con `pass: true` y limpió completamente su fixture sintético.

Fixture:

- 1 root v4;
- 20 segments;
- 40 places;
- 20 connections;
- 20 notes;
- 20 checklist;
- 120 hijos totales;
- 10 hydrates completos;
- 60 updates de reconnect distribuidos en una ventana de 5 s.

Resultado funcional:

- 120/120 children creados;
- 60/60 reconnect updates exitosos;
- 0 fallos de reconnect;
- hydrate confirmó 120 children;
- Eventarc/agregados convergieron a `segmentCount=20`, `placeCount=40`, `total=40`;
- cleanup del fixture: PASS;
- `productionMutated=false`.

## Mediciones observadas

Create:

- creación de children: 751 ms;
- convergencia inicial de agregados: 31,666 ms.

Hydrate, 10 muestras:

- p50: 2,746 ms;
- p95: 17,872 ms;
- p99: 17,872 ms;
- máximo: 17,872 ms.

Reconnect, 60 writes:

- duración total de la ventana: 9,054 ms;
- p50 por write: 4,187 ms;
- p95: 5,644 ms;
- p99: 5,817 ms;
- máximo: 5,817 ms.

Convergencia de agregados posterior al reconnect:

- 17,869 ms.

## Interpretación

Este drill **cierra la evidencia funcional cloud de carga/reconnect en dev**: no hubo pérdida, fallo de escritura ni drift de agregados, y el fixture fue eliminado.

No se declara un PASS de SLO productivo a partir de estas latencias. La muestra mezcla latencia de red local, Firestore/Admin SDK, Eventarc/Cloud Run y posibles cold starts; por tanto sirve como señal de rendimiento para tuning y como baseline de laboratorio, no como compromiso externo.

Antes de producción debe decidirse si estas latencias son aceptables para el flujo real de usuario o si se requiere optimización/medición adicional con cliente navegador y tráfico representativo.
