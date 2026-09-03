import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const root = new globalThis.URL('../', import.meta.url);
const read = (path) => readFile(new URL(path, root), 'utf8');
const lineCount = (content) => content.split('\n').length;

test('useSavedTrips coordina estado sin absorber selección ni operaciones', async () => {
  const hook = await read('src/modules/trips/useSavedTrips.js');
  const selector = await read('src/modules/trips/tripRepositorySelector.js');
  const operations = await read('src/modules/trips/savedTripOperations.js');

  assert.ok(
    lineCount(hook) <= 180,
    `useSavedTrips.js volvió a crecer a ${lineCount(hook)} líneas`
  );
  assert.match(hook, /from '\.\/savedTripOperations\.js'/);
  assert.match(hook, /from '\.\/tripRepositorySelector\.js'/);
  assert.doesNotMatch(
    hook,
    /GateG|Rollout|RemoteConfig|createFirestoreTripRepository|createLocalStorageRepository/
  );

  assert.match(selector, /export function createLocalTripRepository/);
  assert.match(selector, /export function selectTripRepository/);
  assert.match(selector, /createFirestoreV4AppTripRepository/);
  assert.doesNotMatch(selector, /createGateGTripRepository|storageV4Rollout|Hybrid|firestoreTripRepository/);
  assert.match(operations, /export async function importLocalTripsIntoRepository/);
  assert.match(operations, /for \(const trip of localTrips\)/);
  assert.doesNotMatch(operations, /from 'react'/);
});

test('el repositorio autenticado de producto es exclusivamente Storage v4', async () => {
  const repository = await read(
    'src/infrastructure/firebase/firestoreV4AppTripRepository.js'
  );

  assert.match(repository, /createFirestoreV4TripRepository/);
  assert.match(repository, /createFirestoreV4EditorTripWriter/);
  assert.match(repository, /Number\(summary\.schemaVersion\) === 4/);
  assert.match(repository, /lifecycleReady: true/);
  assert.doesNotMatch(
    repository,
    /createFirestoreTripRepository|firestoreHybridTripRepository|storedTripKind|v3Migration|GateG|Rollout/
  );
});

test('el hook descarta listas y errores de un repositorio que ya no está activo', async () => {
  const hook = await read('src/modules/trips/useSavedTrips.js');

  assert.match(hook, /const currentRepositoryRef = useRef\(repository\)/);
  assert.match(hook, /const refreshVersionRef = useRef\(0\)/);
  assert.match(hook, /refreshVersion === refreshVersionRef\.current/);
  assert.match(hook, /currentRepositoryRef\.current === repository/);
  assert.match(hook, /refreshVersionRef\.current \+= 1/);
  assert.match(hook, /if \(isCurrentRepository\(\)\) await refresh\(\)/);
});
