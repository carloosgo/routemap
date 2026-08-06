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
    lineCount(hook) <= 135,
    `useSavedTrips.js volvió a crecer a ${lineCount(hook)} líneas`
  );
  assert.match(hook, /from '\.\/savedTripOperations\.js'/);
  assert.match(hook, /from '\.\/tripRepositorySelector\.js'/);
  assert.doesNotMatch(
    hook,
    /getFirebaseServices|createFirestoreTripRepository|createLocalStorageRepository|for \(const trip of localTrips\)/
  );

  assert.match(selector, /export function createLocalTripRepository/);
  assert.match(selector, /export function selectTripRepository/);
  assert.match(selector, /createFirestoreTripRepository/);
  assert.match(operations, /export async function importLocalTripsIntoRepository/);
  assert.match(operations, /for \(const trip of localTrips\)/);
  assert.doesNotMatch(operations, /from 'react'/);
});
