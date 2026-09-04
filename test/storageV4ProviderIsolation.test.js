import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const STORAGE_WRITE_PATH = [
  'src/modules/storage-v4/syncRuntime.js',
  'src/modules/storage-v4/syncCoordinator.js',
  'src/modules/storage-v4/syncLifecycleController.js',
  'src/modules/storage-v4/indexedDbLocalPersistence.js',
  'src/infrastructure/firebase/createV4WebSyncComposition.js',
  'src/infrastructure/firebase/firestoreV4SyncGateway.js',
  'src/infrastructure/firebase/firestoreV4TripRepository.js',
];

const PROVIDER_DEPENDENCIES = [
  /geoapify/i,
  /googlePlaces/i,
  /googleRoute/i,
  /countryBoundar/i,
  /geocod/i,
  /placeSearch/i,
];

test('el camino de persistencia v4 no depende de proveedores de mapas/búsqueda', async () => {
  for (const path of STORAGE_WRITE_PATH) {
    const source = await readFile(path, 'utf8');
    const imports = source
      .split('\n')
      .filter((line) => /^\s*import\b/.test(line))
      .join('\n');

    for (const forbidden of PROVIDER_DEPENDENCIES) {
      assert.doesNotMatch(
        imports,
        forbidden,
        `${path} acopló el guardado v4 a un proveedor externo: ${forbidden}`
      );
    }
  }
});
