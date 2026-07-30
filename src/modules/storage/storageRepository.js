// Capa de persistencia — patrón Repository.
//
// Contrato común (todas las implementaciones lo cumplen):
//   list()        -> Promise<Trip[]>
//   get(id)       -> Promise<Trip | null>
//   save(trip)    -> Promise<Trip>     (crea o actualiza)
//   remove(id)    -> Promise<void>
//
// Gracias a esta abstracción, migrar de localStorage a un backend REST global
// no requiere tocar la UI: solo cambiar la configuración del entorno.

import { config } from '../../config.js';
import { createLocalStorageRepository } from './localStorageRepository.js';
import { createApiRepository } from './apiRepository.js';

let cached = null;

function clean(value) {
  return typeof value === 'string' ? value.trim() : '';
}

export function createRepository({
  driver = 'local',
  apiBaseUrl = '',
  storageKey = 'atlas:trips:v1',
} = {}) {
  if (driver === 'api') {
    const baseUrl = clean(apiBaseUrl);
    if (!baseUrl) {
      throw new Error('VITE_API_BASE_URL es obligatoria cuando VITE_STORAGE_DRIVER=api.');
    }
    return createApiRepository(baseUrl);
  }

  if (driver === 'local') {
    return createLocalStorageRepository(clean(storageKey));
  }

  throw new Error(`Controlador de almacenamiento no soportado: ${String(driver)}`);
}

export function getRepository() {
  if (!cached) {
    cached = createRepository({
      driver: config.storageDriver,
      apiBaseUrl: config.apiBaseUrl,
      storageKey: config.storageKey,
    });
  }
  return cached;
}

export function resetRepositoryForTests() {
  cached = null;
}
