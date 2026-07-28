# Arquitectura

## Principio rector

Cada módulo es **independiente** y se comunica con los demás mediante
**interfaces/contratos**, no implementaciones concretas. Así la app crece
agregando módulos sin reescribir lo existente, y se pueden cambiar piezas
(geocoder, almacenamiento, mapa) sin tocar la UI.

```
src/
├── config.js              Punto único de configuración (lee .env)
├── shared/                Utilidades puras, sin UI (reutilizables en móvil)
├── i18n/                  Internacionalización (es, en, …)
├── components/            UI reutilizable y agnóstica (autocomplete, money)
└── modules/
    ├── geocoding/         Búsqueda de ciudades (interfaz + proveedor + hook)
    ├── flags/             Resolución de banderas por país
    ├── expenses/          Modelo de gastos + editor
    ├── trips/             Modelo de viaje/tramos, estado y persistencia
    ├── map/               Render del mapa (Leaflet, sustituible)
    └── storage/           Persistencia (interfaz + local + api)
```

## Capas

1. **Modelo / lógica** (`*.js`): formas de datos y cálculos puros
   (`tripModel`, `expenseModel`). Sin React ni DOM → reutilizable en móvil.
2. **Estado** (hooks: `useTrip`, `useSavedTrips`, `useCitySearch`):
   orquestan la lógica con React.
3. **UI** (`*.jsx`): solo presentación; recibe datos y emite eventos.

## Contratos clave (puntos de extensión)

### Geocoder — `modules/geocoding/geocodingProvider.js`
```
search(query, { signal, limit }) -> Promise<CityResult[]>
```
Implementaciones: `nominatimProvider` (default). Para producción global,
agrega `mapboxProvider`/`geoapifyProvider` con la misma firma y cámbialo en
`config.geocoder`. La UI no cambia.

### Storage — `modules/storage/storageRepository.js`
```
list()  get(id)  save(trip)  remove(id)   // todas async
```
Implementaciones: `localStorageRepository` (default) y `apiRepository`
(backend REST). Se elige con `VITE_STORAGE_DRIVER`. Migrar de uno a otro es
un cambio de variable de entorno, sin tocar la UI.

### Mapa — `modules/map/RouteMap.jsx`
Encapsula Leaflet por completo. Para cambiar a Mapbox GL u otro motor, se
reimplementa solo este componente respetando su prop `segments`.

## Modelo de datos

```
Trip {
  id, name, currency, createdAt, updatedAt,
  segments: Segment[]
}
Segment {
  id,
  origin: City | null,
  destination: City | null,
  startDate, endDate,
  expenses: Expenses
}
City { name, displayName, countryCode, lat, lon }
Expenses {
  lodging,
  food: { mode:'single'|'detailed', single, breakfast, lunch, dinner },
  transport: { train, plane, taxi, uber, bus, ferry, boat },
  attractions: LineItem[],   // tipo definido por el usuario
  others: LineItem[]         // tipo libre
}
LineItem { id, label, amount }
```

## Cómo agregar una funcionalidad nueva (ejemplo)

Añadir "categoría: seguros de viaje":
1. Extiende `expenseModel.createExpenses()` y `expensesTotal()`.
2. Agrega su UI en `ExpenseEditor.jsx`.
3. `normalizeExpenses()` ya hace migración defensiva de datos viejos.

Nada más se ve afectado: mapa, storage y trips siguen igual.

## Rendimiento y escala (frontend)

- Build con code-splitting (`react`, `leaflet` en chunks separados) → mejor
  cacheo en CDN.
- Estáticos servibles desde edge/CDN global.
- Búsquedas con debounce + caché + cancelación de peticiones obsoletas.
