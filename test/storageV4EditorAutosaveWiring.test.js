import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

async function read(path) {
  return readFile(new URL(`../${path}`, import.meta.url), 'utf8');
}

test('editor real queda conectado a draft durable y estado de persistencia', async () => {
  const app = await read('src/App.jsx');
  const savedTrips = await read('src/modules/trips/useSavedTrips.js');
  const autosave = await read('src/modules/trips/useTripAutoPersistence.js');
  const mapPane = await read('src/app/AppMapPane.jsx');

  assert.match(app, /useTripAutoPersistence/);
  assert.match(app, /stageTrip/);
  assert.match(app, /getTripPersistenceState/);
  assert.match(app, /persistenceState=\{persistence\.state\}/);

  assert.match(savedTrips, /createTripDraftStore/);
  assert.match(savedTrips, /draftStore\.put\(trip\)/);
  assert.match(savedTrips, /repository\.stage\(trip\)/);
  assert.match(savedTrips, /const draft = await draftStore\.get\(id\)/);
  assert.match(savedTrips, /return draft \|\| storedTrip/);

  assert.match(autosave, /DEFAULT_LOCAL_DEBOUNCE_MS = 350/);
  assert.match(autosave, /stageTrip\(current, \{ remote \}\)/);
  assert.match(autosave, /getTripPersistenceState/);

  assert.doesNotMatch(mapPane, /t\('savedShort'\)/);
  assert.match(mapPane, /data-persistence-state=\{persistenceState\}/);
  assert.match(mapPane, /persistencePending/);
  assert.match(mapPane, /persistenceLocal/);
  assert.match(mapPane, /persistenceSyncing/);
});

test('autosave v4 usa scheduler incremental y no el whole-save como debounce remoto', async () => {
  const writer = await read('src/infrastructure/firebase/firestoreV4EditorTripWriter.js');
  const gate = await read('src/infrastructure/firebase/createGateGTripRepository.js');
  const hybrid = await read('src/infrastructure/firebase/firestoreHybridTripRepository.js');

  assert.match(writer, /runtime\.commitIntent\(intent, \{ schedule: true \}\)/);
  assert.match(writer, /syncComposition\.attachLifecycle\?\.\(\)/);
  assert.match(writer, /planV4TripSave/);
  assert.doesNotMatch(writer, /setInterval\([^)]*save/);
  assert.doesNotMatch(writer, /setTimeout\([^)]*baseWriter\.save/);

  assert.match(gate, /createFirestoreV4EditorTripWriter/);
  assert.match(hybrid, /writer\.stage\(rawTrip\)/);
  assert.match(hybrid, /writer\.getPersistenceState\(tripId\)/);
});
