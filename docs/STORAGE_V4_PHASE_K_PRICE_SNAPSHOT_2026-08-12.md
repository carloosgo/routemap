# Atlas Storage v4 — Phase K price snapshot — 2026-08-12

Este archivo conserva una fotografia fechada de precios publicos usados para preparar el modelo de costo. No es una factura, no reemplaza Cloud Billing y no autoriza un budget.

## Firestore Standard — Mexico (`northamerica-south1`)

Fuente oficial consultada: `https://cloud.google.com/firestore/pricing`

La pagina oficial incluye Mexico (`northamerica-south1`) entre las ubicaciones de Firestore Standard y, en la tabla de precio default observada el 2026-08-12, publica:

- document reads: USD 0.03 por 100,000;
- document writes: USD 0.09 por 100,000;
- document deletes: USD 0.01 por 100,000;
- stored data: USD 0.000205479 por GiB-hora (aprox. USD 0.15/GiB-mes usando 730 h);
- PITR data: USD 0.000205479 por GiB-hora (aprox. USD 0.15/GiB-mes usando 730 h);
- backup data: USD 0.000041096 por GiB-hora (aprox. USD 0.03/GiB-mes usando 730 h);
- restore operation: USD 0.20 por GiB.

La cuota gratuita solo aplica a una base por proyecto. PITR, backups y restores no entran en uso gratuito; las bases nombradas tampoco califican para la cuota gratuita. El modelo del repo mantiene free-tier/credits fuera del subtotal bruto para no esconder supuestos de billing.

## Cloud Run / Functions Gen2

Fuente oficial consultada: `https://cloud.google.com/run/pricing`

Las funciones Gen2 se ejecutan y facturan como servicios Cloud Run. Mexico (`northamerica-south1`) aparece en Tier 1. El precio default observado para requests es USD 0.40 por 1,000,000, pero el costo real de Functions Gen2 tambien depende de CPU, memoria, tiempo activo, concurrencia, transferencia y free tier. Por eso el modelo actual no debe presentarse como costo total de Functions si solo se alimenta el precio por requests.

## Geoapify autocomplete

Fuentes oficiales consultadas:

- `https://www.geoapify.com/pricing/`
- `https://apidocs.geoapify.com/docs/geocoding/forward-geocoding/`

Address Autocomplete consume 1 credito por request. Snapshot de planes mensuales publicado el 2026-08-12:

| plan | creditos/dia | USD/mes |
|---|---:|---:|
| Free | 3,000 | 0 |
| API 10 | 10,000 | 59 |
| API 25 | 25,000 | 109 |
| API 50 | 50,000 | 179 |
| API 100 | 100,000 | 299 |
| API 250 | 250,000 | 609 |
| Custom | unmetered | desde 860 |

El repo contiene `scripts/geoapifyPlanModel.mjs` para seleccionar el tier por requests diarios sin transformar artificialmente una suscripcion por tiers en un precio lineal por request. Volumen superior a API 250 queda como `Custom` y exige cotizacion; no se inventa un precio fijo.

## Lo que aun falta para una proyeccion Atlas aprobada

Los precios unitarios por si solos no cierran el modelo. Antes de publicar una proyeccion 1k/10k/50k/100k como costo esperado se necesitan supuestos de producto medidos o aprobados, entre ellos:

- sesiones por usuario activo/dia;
- reads por sesion;
- mutaciones logicas por sesion;
- writes reales por mutacion;
- deletes por sesion;
- invocaciones Functions por sesion;
- lookups Geoapify por sesion y cache-hit real;
- GiB canonicos/PITR/backup por usuario activo;
- CPU, memoria y duracion de Cloud Run Functions;
- transferencia/egress y cualquier Object Storage realmente usado.

Hasta entonces, cualquier escenario numerico debe etiquetarse como simulacion parametrica, no como forecast operativo ni budget recomendado.
