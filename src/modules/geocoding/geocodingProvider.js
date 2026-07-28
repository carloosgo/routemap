// Interfaz y fábrica del proveedor de geocodificación.
// Contrato: search(query, { signal, limit }) -> Promise<CityResult[]>
//
// CityResult: {
//   id: string,
//   name: string,          // nombre corto de la ciudad
//   displayName: string,   // nombre completo (ciudad, región, país)
//   countryCode: string,   // ISO alpha-2 en mayúsculas (para la bandera)
//   lat: number,
//   lon: number,
// }
//
// Esto desacopla la UI del proveedor concreto. Cambiar a Mapbox/Google
// solo requiere implementar otro provider con la misma firma.

import { config } from '../../config.js';
import { createNominatimProvider } from './nominatimProvider.js';

let cached = null;

export function getGeocoder() {
  if (cached) return cached;
  switch (config.geocoder) {
    case 'nominatim':
    default:
      cached = createNominatimProvider();
      break;
    // case 'mapbox':
    //   cached = createMapboxProvider(config.mapboxToken);
    //   break;
  }
  return cached;
}
