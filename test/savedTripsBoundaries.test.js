import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { sameStoredTripVersion } from '../src/infrastructure/firebase/firestoreTripRepository.js';

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
    /getFirebaseServices|createFirestoreTripRepository|createLocalStorageRepository|for \(const trip of localTrips\)/
  );

  assert.match(selector, /export function createLocalTripRepository/);
  assert.match(selector, /export function selectTripRepository/);
  assert.match(selector, /createFirestoreTripRepository/);
  assert.match(operations, /export async function importLocalTripsIntoRepository/);
  assert.match(operations, /for \(const trip of localTrips\)/);
  assert.doesNotMatch(operations, /from 'react'/);
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

test('la comparación de versiones detecta cambios en revisión y timestamp', () => {
  const version = {
    storageVersion: 2,
    activeRevision: 'revision001',
    updatedAt: '2026-08-05T00:00:00.000Z',
  };

  assert.equal(sameStoredTripVersion(version, { ...version }), true);
  assert.equal(
    sameStoredTripVersion(version, { ...version, activeRevision: 'revision002' }),
    false
  );
  assert.equal(
    sameStoredTripVersion(version, { ...version, updatedAt: '2026-08-05T00:01:00.000Z' }),
    false
  );
  assert.equal(sameStoredTripVersion(null, null), true);
  assert.equal(sameStoredTripVersion(version, null), false);
});

test('Firestore serializa guardados locales y publica solo sobre la versión leída', async () => {
  const repository = await read(
    'src/infrastructure/firebase/firestoreTripRepository.js'
  );

  assert.match(repository, /let saveQueue = Promise\.resolve\(\)/);
  assert.match(repository, /const baseVersion = storedVersion\(await getDoc\(tripRef\)\)/);
  assert.match(repository, /await runTransaction\(db/);
  assert.match(repository, /const currentVersion = storedVersion\(await transaction\.get\(tripRef\)\)/);
  assert.match(repository, /sameStoredTripVersion\(currentVersion, baseVersion\)/);
  assert.match(repository, /transaction\.set\(tripRef, payload\.summary\)/);
  assert.match(repository, /saveQueue = operation\.catch\(\(\) => undefined\)/);
  assert.doesNotMatch(repository, /await setDoc\(tripRef, payload\.summary\)/);
});
