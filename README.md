# Atlas — Rutas de viaje y gastos

Aplicación web para planear y rastrear **rutas de viaje internacionales** con
control de gastos por tramo. Arquitectura modular pensada para escalar a uso
global y para migrar a móvil (iOS/Android) reutilizando la lógica.

## Funcionalidades

- Mapa mundial interactivo (Leaflet) que dibuja cada tramo como una línea de
  color distinto, con marcadores y banderas por ciudad.
- Búsqueda de ciudades con autocompletado **a partir del 3er carácter**.
- Bandera del país por cada ciudad (ISO + flagcdn.com).
- Gastos por tramo: hospedaje, alimentos (gasto único o desayuno/comida/cena),
  transporte (tren, avión, taxi, Uber, autobús, ferry, barco), atracciones
  (tipo definido por el usuario) y otros gastos (tipo libre).
- Total por tramo y **total general del viaje**.
- "N" tramos por viaje que suman al total.
- **Continuidad automática**: cada tramo nuevo hereda la ciudad destino y la
  última fecha del tramo anterior.
- Guardar, consultar y editar viajes.
- Multi-idioma (ES/EN) y multi-moneda.

## Requisitos

- Node.js >= 18

## Arrancar en desarrollo

```bash
npm install
cp .env.example .env.local   # ajusta variables si lo necesitas
npm run dev
```

Abre http://localhost:5173

## Compilar para producción

```bash
npm run build      # genera /dist (estáticos para CDN)
npm run preview    # sirve el build localmente para probar
```

El contenido de `/dist` se publica en cualquier hosting estático global
(Cloudflare Pages, Vercel, Netlify, S3 + CloudFront).

## Configuración (.env.local)

| Variable | Descripción |
|---|---|
| `VITE_STORAGE_DRIVER` | `local` (localStorage) o `api` (backend REST) |
| `VITE_API_BASE_URL` | URL del backend cuando `driver=api` |
| `VITE_GEOCODER` | `nominatim` (default) |
| `VITE_DEFAULT_LOCALE` | `es` o `en` |

## Documentación

- `ARCHITECTURE.md` — diseño modular y cómo extender.
- `SECURITY.md` — checklist de seguridad para publicación.
- `server/README.md` — blueprint del backend (FastAPI) para escala global.

## Hacia móvil (iOS/Android)

Toda la lógica de negocio vive en `src/modules/**/*.js` y `src/shared/*.js`,
sin dependencias del DOM. Esa capa se reutiliza tal cual en React Native;
solo se reimplementa la capa visual (`.jsx`) y el mapa (react-native-maps).
