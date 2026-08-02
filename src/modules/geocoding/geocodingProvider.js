// Interfaz y fábrica del proveedor usado exclusivamente para buscar ciudades.
// Contrato: search(query, { signal, limit }) -> Promise<CityResult[]>
//
// CityResult: {
//   id: string,
//   name: string,
//   displayName: string,
//   countryCode: string,
//   lat: number,
//   lon: number,
// }

import { createNominatimProvider } from './nominatimProvider.js';

let cached = null;

export function getGeocoder() {
  if (!cached) cached = createNominatimProvider();
  return cached;
}
