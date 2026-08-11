import { after, before, beforeEach, test } from 'node:test';
import assert from 'node:assert/strict';
import { initializeTestEnvironment } from '@firebase/rules-unit-testing';
import { collection, doc, setDoc } from 'firebase/firestore';
import { readFile } from 'node:fs/promises';
import {
  UNKNOWN_TRIP_STORAGE_CODE,
  V4_WRITE_NOT_ENABLED_CODE,
  createFirestoreHybridTripRepository,
} from '../src/infrastructure/firebase/firestoreHybridTripRepository.js';
import { createFirestoreV4TripRepository } from '../src/infrastructure/firebase/firestoreV4TripRepository.js';
import { createTripRevisionPayload } from '../src/infrastructure/firebase/tripStorageSchema.js';
import { initialRankForPosition } from '../src/modules/storage-v4/rankModel.js';
import { createExpenses } from '../src/modules/expenses/expenseModel.js';

let testEnv;

function legacyTrip(id, name) {
  return {
    id,
    name,
    currency: 'EUR',
    placeOrderVersion: 1,
    createdAt: '2026-01-01T10:00:00.000Z',
    updatedAt: '2026-08-10T20:00:00.000Z',
    segments: [{
      id: `${id}-segment`,
      origin: null,
      destination: null,
      startDate: '',
      endDate: '',
      expenses: createExpenses(),
      note: `${name} segment`,
    }],
    places: [],
    routeConnections: [],
    notes: [{ id: `${id}-note`, title: 'Nota', text: name }],
    checklist: [],
  };
}

async function seedVersionedTrip(db, rawTrip, storageVersion) {
  const revisionId = `${rawTrip.id}_revision_01`;
  const payload = createTripRevisionPayload(rawTrip, revisionId, rawTrip.updatedAt);
  const tripRef = doc(db, 'users', 'alice', 'trips', rawTrip.id);
  const revisionRef = doc(tripRef, 'revisions', revisionId);
  const summary = { ...payload.summary, storageVersion };
  const revision = { ...payload.revision, complete: true };
  if (storageVersion === 2) {
    delete summary.routeConnectionCount;
    delete revision.routeConnectionCount;
  }
  await setDoc(tripRef, summary);
  await setDoc(revisionRef, revision);
  for (const [collectionName, items] of Object.entries(payload.collections)) {
    for (let index = 0; index < items.length; index += 1) {
      await setDoc(
        doc(collection(revisionRef, collectionName), String(index).padStart(6, '0')),
        items[index]
      );
    }
  }
}

before(async () => {
  testEnv = await initializeTestEnvironment({
    projectId: 'atlasmap-hybrid-rollout-test',
    firestore: {
      host: '127.0.0.1',
      port: 8080,
      rules: await readFile('firestore-v4.rules', 'utf8'),
    },
  });
});

beforeEach(async () => {
  await testEnv.clearFirestore();
});

after(async () => {
  await testEnv?.cleanup();
});

test('repositorio híbrido lista y abre viajes v2, v3 y v4 del mismo usuario', async () => {
  await testEnv.withSecurityRulesDisabled(async (context) => {
    const adminDb = context.firestore();
    await seedVersionedTrip(adminDb, legacyTrip('trip-v2', 'Viaje V2'), 2);
    await seedVersionedTrip(adminDb, legacyTrip('trip-v3', 'Viaje V3'), 3);
  });

  const db = testEnv.authenticatedContext('alice').firestore();
  const v4 = createFirestoreV4TripRepository({ db, uid: 'alice' });
  await v4.createTripRoot({
    id: 'trip-v4',
    name: 'Viaje V4',
    currency: 'EUR',
    segments: [], places: [], routeConnections: [], notes: [], checklist: [],
  });
  await v4.createEntity('trip-v4', 'note', {
    id: 'note-v4',
    title: 'V4',
    text: 'Nota v4',
  }, initialRankForPosition(0));

  const hybrid = createFirestoreHybridTripRepository({ db, uid: 'alice' });
  const listed = await hybrid.list();
  assert.deepEqual(
    new Set(listed.map((item) => item.id)),
    new Set(['trip-v2', 'trip-v3', 'trip-v4'])
  );

  const v2Trip = await hybrid.get('trip-v2');
  const v3Trip = await hybrid.get('trip-v3');
  const v4Trip = await hybrid.get('trip-v4');
  assert.equal(v2Trip.name, 'Viaje V2');
  assert.equal(v2Trip.segments[0].id, 'trip-v2-segment');
  assert.equal(v3Trip.name, 'Viaje V3');
  assert.equal(v3Trip.notes[0].id, 'trip-v3-note');
  assert.equal(v4Trip.name, 'Viaje V4');
  assert.equal(v4Trip.notes[0].id, 'note-v4');
});

test('viaje con marcador de versión desconocido falla cerrado al abrirse', async () => {
  await testEnv.withSecurityRulesDisabled(async (context) => {
    await setDoc(doc(context.firestore(), 'users', 'alice', 'trips', 'trip-unknown'), {
      id: 'trip-unknown',
      name: 'Future',
      schemaVersion: 99,
      updatedAt: '2026-08-10T20:00:00.000Z',
    });
  });
  const db = testEnv.authenticatedContext('alice').firestore();
  const hybrid = createFirestoreHybridTripRepository({ db, uid: 'alice' });
  await assert.rejects(
    hybrid.get('trip-unknown'),
    (error) => error?.code === UNKNOWN_TRIP_STORAGE_CODE
  );
});

test('save revalida root y bloquea v3 stale si backend migró el viaje a v4', async () => {
  const raw = legacyTrip('trip-race-save', 'Race save');
  await testEnv.withSecurityRulesDisabled(async (context) => {
    await seedVersionedTrip(context.firestore(), raw, 3);
  });
  const db = testEnv.authenticatedContext('alice').firestore();
  const hybrid = createFirestoreHybridTripRepository({ db, uid: 'alice' });
  await hybrid.list();

  await testEnv.withSecurityRulesDisabled(async (context) => {
    await setDoc(doc(context.firestore(), 'users', 'alice', 'trips', raw.id), {
      id: raw.id,
      name: raw.name,
      currency: 'EUR',
      schemaVersion: 4,
      status: 'active',
      version: 1,
    });
  });

  await assert.rejects(
    hybrid.save({ ...raw, name: 'No debe sobrescribir v4' }),
    (error) => error?.code === V4_WRITE_NOT_ENABLED_CODE
  );
  const root = await testEnv.withSecurityRulesDisabled(async (context) =>
    context.firestore().doc(`users/alice/trips/${raw.id}`).get()
  );
  assert.equal(root.data().schemaVersion, 4);
  assert.equal(root.data().name, raw.name);
});

test('remove revalida root y nunca borra un viaje ya migrado a v4', async () => {
  const raw = legacyTrip('trip-race-remove', 'Race remove');
  await testEnv.withSecurityRulesDisabled(async (context) => {
    await seedVersionedTrip(context.firestore(), raw, 3);
  });
  const db = testEnv.authenticatedContext('alice').firestore();
  const hybrid = createFirestoreHybridTripRepository({ db, uid: 'alice' });
  await hybrid.get(raw.id);

  await testEnv.withSecurityRulesDisabled(async (context) => {
    await setDoc(doc(context.firestore(), 'users', 'alice', 'trips', raw.id), {
      id: raw.id,
      name: raw.name,
      currency: 'EUR',
      schemaVersion: 4,
      status: 'active',
      version: 1,
    });
  });

  await assert.rejects(
    hybrid.remove(raw.id),
    (error) => error?.code === V4_WRITE_NOT_ENABLED_CODE
  );
  const root = await testEnv.withSecurityRulesDisabled(async (context) =>
    context.firestore().doc(`users/alice/trips/${raw.id}`).get()
  );
  assert.equal(root.exists(), true);
  assert.equal(root.data().schemaVersion, 4);
});
