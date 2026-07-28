// Capa de persistencia — patrón Repository.
//
// Contrato común (todas las implementaciones lo cumplen):
//   list()        -> Promise<Trip[]>
//   get(id)       -> Promise<Trip | null>
//   save(trip)    -> Promise<Trip>     (crea o actualiza)
//   remove(id)    -> Promise<void>
//
// Gracias a esta abstracción, migrar de localStorage a un backend REST global
// NO requiere tocar la UI: solo cambiar VITE_STORAGE_DRIVER=api en el entorno.

import { config } from '../../config.js';
import { createLocalStorageRepository } from './localStorageRepository.js';
import { createApiRepository } from './apiRepository.js';

let cached = null;

export function getRepository() {
  if (cached) return cached;
  switch (config.storageDriver) {
    case 'api':
      cached = createApiRepository(config.apiBaseUrl);
      break;
    case 'local':
    default:
      cached = createLocalStorageRepository(config.storageKey);
      break;
  }
  return cached;
}
