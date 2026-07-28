# Backend (blueprint) — FastAPI

Plano de referencia para cuando actives almacenamiento multiusuario global
(`VITE_STORAGE_DRIVER=api`). El frontend ya está listo: `apiRepository.js`
consume estos endpoints.

> Aún no es código de producción: es la estructura recomendada para que el
> backend cumpla el mismo contrato que el repositorio local.

## Contrato de la API

| Método | Ruta | Descripción |
|---|---|---|
| GET | `/api/trips` | Lista los viajes del usuario autenticado |
| GET | `/api/trips/{id}` | Devuelve un viaje |
| POST | `/api/trips` | Crea un viaje |
| PUT | `/api/trips/{id}` | Actualiza un viaje |
| DELETE | `/api/trips/{id}` | Elimina un viaje |

La forma JSON del `Trip` es idéntica a la del frontend
(ver `ARCHITECTURE.md` → Modelo de datos).

## Stack recomendado

- **FastAPI** (async) + **Uvicorn/Gunicorn**.
- **PostgreSQL** + **SQLAlchemy** (async) + **Alembic** (migraciones).
- **Pydantic** para validación de esquemas.
- **Auth**: JWT corto + refresh, o proveedor externo (Auth0/Cognito).
- **Redis** para caché de geocodificación y rate limiting.

## Estructura sugerida

```
server/
├── app/
│   ├── main.py            # FastAPI app, middlewares (CORS, rate limit)
│   ├── core/
│   │   ├── config.py      # settings desde entorno
│   │   └── security.py    # auth, hashing, JWT
│   ├── models/            # modelos SQLAlchemy (User, Trip, Segment)
│   ├── schemas/           # esquemas Pydantic (validación I/O)
│   ├── api/
│   │   └── trips.py       # routers REST (contrato de arriba)
│   ├── services/
│   │   └── geocoding.py   # proxy con caché al proveedor de geocoding
│   └── db/                # sesión, init, migraciones
├── requirements.txt
└── Dockerfile
```

## Escala global (referencia)

- Stateless API detrás de un **load balancer**, múltiples réplicas (k8s/ECS).
- PostgreSQL gestionado con réplicas de lectura.
- CDN para el frontend; API en varias regiones si la latencia importa.
- Observabilidad: métricas (Prometheus), trazas (OpenTelemetry), logs centralizados.

## Endpoint de geocoding (proxy)

Para no exponer claves ni depender del Nominatim público, el frontend puede
llamar a `GET /api/geocode?q=...` y el backend hace de proxy con caché y rate
limit hacia el proveedor real. Si lo activas, cambia `getGeocoder()` para que
apunte a tu endpoint.
