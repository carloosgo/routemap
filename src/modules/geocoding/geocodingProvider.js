// Proveedor usado exclusivamente para buscar ciudades del itinerario.
// Contrato: search(query, { signal, limit }) -> Promise<CityResult[]>

import { createGeoapifyCityProvider } from './citySearchClient.js';

let cached = null;

export function getGeocoder() {
  if (!cached) cached = createGeoapifyCityProvider();
  return cached;
}
