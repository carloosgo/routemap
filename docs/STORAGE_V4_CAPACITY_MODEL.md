# Storage v4 — capacity and cost input model

El modelo de volumen vive en `scripts/storageV4CapacityModel.mjs`. Su objetivo es convertir **supuestos explícitos** de uso en volúmenes diarios para los escenarios requeridos de 1k, 10k, 50k y 100k usuarios activos.

El modelo mensual de costo vive en `scripts/storageV4CostModel.mjs`. No contiene precios hardcodeados: recibe un `priceBook` explícito y fechado, de forma que una revisión futura pueda reproducirse sin confundir precios históricos con precios vigentes.

## Inputs de capacidad obligatorios

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

## Price book explícito

`storageV4CostModel.mjs` exige todos los precios/supuestos monetarios; deliberadamente no tiene defaults. El caller debe proporcionar:

- `daysPerMonth`;
- `firestoreReadUsdPer100k`;
- `firestoreWriteUsdPer100k`;
- `firestoreDeleteUsdPer100k`;
- `functionInvocationUsdPerMillion`;
- `providerRequestUsdEach`;
- GiB por usuario y USD/GiB-mes de storage canónico;
- GiB por usuario y USD/GiB-mes de PITR;
- GiB por usuario y USD/GiB-mes de backups;
- GiB por usuario y USD/GiB-mes de object storage.

La unidad `USD` aquí es solo la unidad del cálculo operacional. Si una tarifa contractual o proveedor está en otra moneda, debe convertirse fuera del modelo y registrar la fuente/tasa utilizada en la revisión.

El modelo devuelve volumen mensual, costos por operaciones, costos de storage y subtotal para 1k/10k/50k/100k usuarios activos.

## Exclusiones deliberadas del subtotal

El subtotal no pretende ser la factura total. Quedan fuera, hasta contar con inputs explícitos:

- free tier/allowances y créditos;
- egress;
- CPU/memoria/duración de Cloud Run;
- cargos de Cloud Logging/Monitoring;
- email/AI y proveedores no representados por `providerRequestUsdEach`;
- impuestos, descuentos negociados y compromisos contractuales.

Esto evita producir una cifra aparentemente precisa a partir de cargos no medidos.

## Regla arquitectónica que debe vigilar el modelo

`firestoreWritesPerLogicalMutation` debe permanecer cercano a la intención de arquitectura: una modificación lógica produce aproximadamente una escritura lógica de entidad. Un crecimiento sostenido de este factor requiere investigación antes de escalar tráfico.

## Procedimiento de revisión de costo

1. fijar fecha de la revisión;
2. capturar precios oficiales vigentes por región/producto;
3. registrar los supuestos de uso y su fuente;
4. generar los cuatro escenarios de volumen;
5. llenar el `priceBook` explícito;
6. generar los cuatro escenarios mensuales de costo;
7. añadir por separado las exclusiones aplicables;
8. comparar con budget y forecast;
9. conservar inputs/resultados con fecha para poder explicar cambios posteriores.

Los modelos sirven para capacidad y sensibilidad; no reemplazan Billing export, métricas reales ni una factura del proveedor.
