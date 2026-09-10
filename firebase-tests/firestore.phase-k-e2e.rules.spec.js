import { after, before, beforeEach, test } from 'node:test';
import {
  assertFails,
  assertSucceeds,
  initializeTestEnvironment,
} from '@firebase/rules-unit-testing';
import {
  deleteDoc,
  doc,
  getDoc,
  serverTimestamp,
  setDoc,
  updateDoc,
} from 'firebase/firestore';
import { readFile } from 'node:fs/promises';
import { initialRankForPosition } from '../src/modules/storage-v4/rankModel.js';

let testEnv;

function city(name, lat, lon) {
  return {
    id: '',
    name,
    displayName: name,
    country: 'México',
    countryCode: 'MX',
    lat,
    lon,
  };
}

function v4Trip(id, overrides = {}) {
  return {
    id,
    name: 'Phase K v4 trip',
    currency: 'MXN',
    origin: city('Ciudad de México', 19.4326, -99.1332),
    schemaVersion: 4,
    status: 'active',
    version: 1,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
    deletedAt: null,
    purgeAfter: null,
    segmentCount: 0,
    placeCount: 0,
    total: 0,
    ...overrides,
  };
}

function expenses() {
  return {
    lodging: 0,
    food: { mode: 'single', single: 0, breakfast: 0, lunch: 0, dinner: 0 },
    transport: { plane: 0, train: 0, bus: 0, taxiUber: 0 },
    transportOthers: [],
    attractions: [],
    others: [],
  };
}

function v4Segment(id = 'segment-1', overrides = {}) {
  return {
    id,
    rank: initialRankForPosition(0),
    destination: city('Puebla', 19.0414, -98.2063),
    startDate: '2026-12-01',
    endDate: '2026-12-02',
    expenses: expenses(),
    note: '',
    status: 'active',
    version: 1,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
    deletedAt: null,
    ...overrides,
  };
}

before(async () => {
  testEnv = await initializeTestEnvironment({
    projectId: 'atlasmap-phase-k-e2e-rules-test',
    firestore: {
      host: '127.0.0.1',
      port: 8080,
      rules: await readFile('firestore.rules', 'utf8'),
    },
  });
});

beforeEach(async () => {
  await testEnv.clearFirestore();
});

after(async () => {
  await testEnv?.cleanup();
});

test('Phase K usa el contrato v4 normal para root y entidades', async () => {
  const alice = testEnv.authenticatedContext('alice').firestore();
  const tripId = 'phase-k-e2e-trip';
  const tripRef = doc(alice, `users/alice/trips/${tripId}`);
  const segmentRef = doc(alice, `users/alice/trips/${tripId}/segments/segment-1`);

  await assertSucceeds(setDoc(tripRef, v4Trip(tripId)));
  await assertSucceeds(setDoc(segmentRef, v4Segment()));
  await assertSucceeds(getDoc(segmentRef));
});

test('Phase K mantiene aislamiento estricto por usuario', async () => {
  const alice = testEnv.authenticatedContext('alice').firestore();
  const bob = testEnv.authenticatedContext('bob').firestore();
  const tripId = 'phase-k-e2e-cross-user';

  await assertSucceeds(setDoc(
    doc(alice, `users/alice/trips/${tripId}`),
    v4Trip(tripId)
  ));
  await assertFails(getDoc(doc(bob, `users/alice/trips/${tripId}`)));
  await assertFails(setDoc(
    doc(bob, `users/alice/trips/${tripId}`),
    v4Trip(tripId)
  ));
});

test('Phase K rechaza versiones stale del root v4', async () => {
  const alice = testEnv.authenticatedContext('alice').firestore();
  const tripId = 'phase-k-e2e-version';
  const tripRef = doc(alice, `users/alice/trips/${tripId}`);

  await assertSucceeds(setDoc(tripRef, v4Trip(tripId)));
  await assertSucceeds(updateDoc(tripRef, {
    name: 'Versión 2',
    version: 2,
    updatedAt: serverTimestamp(),
  }));
  await assertFails(updateDoc(tripRef, {
    name: 'Escritura stale',
    version: 2,
    updatedAt: serverTimestamp(),
  }));
});

test('Phase K mantiene lifecycle server-authoritative', async () => {
  const alice = testEnv.authenticatedContext('alice').firestore();
  const tripId = 'phase-k-e2e-delete-denied';
  const tripRef = doc(alice, `users/alice/trips/${tripId}`);

  await assertSucceeds(setDoc(tripRef, v4Trip(tripId)));
  await assertFails(deleteDoc(tripRef));
});

test('Phase K no permite reintroducir origin físico en segments', async () => {
  const alice = testEnv.authenticatedContext('alice').firestore();
  const tripId = 'phase-k-e2e-origin';
  await assertSucceeds(setDoc(
    doc(alice, `users/alice/trips/${tripId}`),
    v4Trip(tripId)
  ));

  await assertFails(setDoc(
    doc(alice, `users/alice/trips/${tripId}/segments/segment-with-origin`),
    v4Segment('segment-with-origin', {
      origin: city('Ciudad de México', 19.4326, -99.1332),
    })
  ));
});
