# Storage v4 — capacity and cost input model

El modelo de volumen vive en `scripts/storageV4CapacityModel.mjs`. Su objetivo es convertir **supuestos explícitos** de uso en volúmenes diarios para los escenarios requeridos de 1k, 10k, 50k y 100k usuarios activos.

No contiene precios de Firebase, Google Cloud ni proveedores. Los precios cambian y deben aplicarse fuera del runtime usando la tarifa vigente al momento de cada revisión.

## Inputs obligatorios

- `sessionsPerActiveUserPerDay`
- `firestoreReadsPerSession`
- `logicalMutationsPerSession`
- `firestoreWritesPerLogicalMutation`
- `firestoreDeletesPerSession`
- `functionInvocationsPerSession`
- `providerLookupsPerSession`
- `providerCacheHitRate` entre 0 y 1

No existen defaults de producto para estos valores: deben venir de medición, prueba de carga o una hipótesis aprobada y quedar registrados junto con la revisión.

## Outputs diarios

Por escenario se obtienen:

- sesiones;
- reads de Firestore;
- mutaciones lógicas;
- writes de Firestore;
- deletes;
- invocaciones de Functions;
- lookups de proveedor;
- hits de cache;
- requests efectivos al proveedor después del cache.

## Regla arquitectónica que debe vigilar el modelo

`firestoreWritesPerLogicalMutation` debe permanecer cercano a la intención de arquitectura: una modificación lógica produce aproximadamente una escritura lógica de entidad. Un crecimiento sostenido de este factor requiere investigación antes de escalar tráfico.

## Conversión a costo

Para una revisión de costo:

1. fijar fecha de la revisión;
2. capturar precios oficiales vigentes por región/producto;
3. registrar los supuestos de uso y su fuente;
4. generar los cuatro escenarios de volumen;
5. aplicar precios unitarios fuera del código;
6. añadir almacenamiento, egress, backups/PITR y otros cargos que no se modelen como operación por sesión;
7. comparar con budget y forecast;
8. conservar la hoja/resultados con fecha para poder explicar cambios posteriores.

El modelo sirve para capacidad y sensibilidad; no pretende reemplazar Billing export ni métricas reales de producción.