// test-contract: architecture
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

async function read(path) {
  return readFile(new URL(`../../${path}`, import.meta.url), 'utf8');
}

test('editor real queda conectado a draft durable y estado de persistencia', async () => {
  const app = await read('src/App.jsx');
  const savedTrips = await read('src/modules/trips/useSavedTrips.js');
  const autosave = await read('src/modules/trips/useTripAutoPersistence.js');
  const draftStore = await read('src/modules/trips/tripDraftStore.js');
  const mapPane = await read('src/app/AppMapPane.jsx');
  assert.ok(app.includes('useTripAutoPersistence'));
  assert.ok(app.includes('getActiveTripDraft'));
  assert.ok(app.includes('loadTrip(normalizeRecoveredDraft(draft))'));
  assert.ok(app.includes("from './app/recoveredTripDraft.js'"));
  assert.ok(app.includes('currentTripRef.current !== initialTripRef.current'));
  assert.ok(app.includes('stageTrip'));
  assert.ok(app.includes('getTripPersistenceState'));
  assert.ok(app.includes('persistenceState={persistence.state}'));
  assert.ok(savedTrips.includes('createTripDraftStore'));
  assert.ok(savedTrips.includes('draftStore.put(trip)'));
  assert.ok(savedTrips.includes('repository.stage(trip)'));
  assert.ok(savedTrips.includes('const draft = await draftStore.get(id)'));
  assert.ok(savedTrips.includes('return draft || storedTrip'));
  assert.ok(draftStore.includes("ACTIVE_DRAFT_ID = '__active__'"));
  assert.ok(draftStore.includes('getActive: getActiveDraft'));
  assert.ok(draftStore.includes('draftId: ACTIVE_DRAFT_ID'));
  assert.ok(autosave.includes('DEFAULT_LOCAL_DEBOUNCE_MS = 350'));
  assert.ok(autosave.includes('stageTripRef.current = stageTrip'));
  assert.ok(autosave.includes('const stage = stageTripRef.current'));
  assert.ok(autosave.includes('isTripEditTransition(previous, trip)'));
  assert.ok(!mapPane.includes("t('savedShort')"));
  assert.ok(mapPane.includes('data-persistence-state={persistenceState}'));
  assert.ok(mapPane.includes('persistencePending'));
  assert.ok(mapPane.includes('persistenceLocal'));
  assert.ok(mapPane.includes('persistenceSyncing'));
});

test('autosave v4 usa scheduler incremental y no el whole-save como debounce remoto', async () => {
  const writer = await read('src/infrastructure/firebase/firestoreV4EditorTripWriter.js');
  const gate = await read('src/infrastructure/firebase/createGateGTripRepository.js');
  const hybrid = await read('src/infrastructure/firebase/firestoreHybridTripRepository.js');
  assert.ok(writer.includes('runtime.commitIntent(intent, { schedule: true })'));
  assert.ok(writer.includes('syncComposition.attachLifecycle?.()'));
  assert.ok(writer.includes('planV4TripSave'));
  assert.ok(!writer.includes('setInterval'));
  assert.ok(!writer.includes('setTimeout'));
  assert.ok(gate.includes('createFirestoreV4EditorTripWriter'));
  assert.ok(hybrid.includes('writer.stage(rawTrip)'));
  assert.ok(hybrid.includes('writer.getPersistenceState(tripId)'));
});
