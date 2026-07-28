// Configuración central de la aplicación.
// Punto único de verdad: cambiar comportamiento global desde aquí o vía .env,
// sin tocar los módulos. Esto mantiene los módulos desacoplados.

const env = import.meta.env;

export const config = {
  // --- Almacenamiento ---
  // "local" = navegador (localStorage). "api" = backend REST.
  storageDriver: env.VITE_STORAGE_DRIVER || 'local',
  apiBaseUrl: env.VITE_API_BASE_URL || '',
  storageKey: 'atlas:trips:v1',

  // --- Geocodificación / autocompletado de ciudades ---
  geocoder: env.VITE_GEOCODER || 'nominatim',
  citySearchMinChars: 3,
  citySearchDebounceMs: 350,
  citySearchLimit: 6,

  // --- Idioma ---
  defaultLocale: env.VITE_DEFAULT_LOCALE || 'es',

  // --- Mapa (Mapbox GL JS) ---
  map: {
    // Mapbox usa [lon, lat].
    // Esta vista inicial apunta a México para confirmar visualmente que carga bien.
    initialCenter: [-99.1332, 19.4326],
    initialZoom: 4,

    accessToken: env.VITE_MAPBOX_TOKEN || '',

    // Forzado temporalmente para evitar que VITE_MAPBOX_STYLE rompa el mapa.
    styleUrl: 'mapbox://styles/mapbox/streets-v12',

    // Marcadores de inicio/fin del recorrido completo.
    startColor: '#15803d',
    endColor: '#e23b3b',
  },

  // Paleta para diferenciar cada tramo con un color distinto.
  segmentColors: [
    '#e23b3b',
    '#2563eb',
    '#7c3aed',
    '#ea580c',
    '#0891b2',
    '#db2777',
    '#65a30d',
    '#ca8a04',
  ],
};

// Devuelve el color asignado a un tramo según su índice.
export function colorForIndex(index) {
  const palette = config.segmentColors;
  return palette[index % palette.length];
}
