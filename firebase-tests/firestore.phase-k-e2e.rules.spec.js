import { after, before, test } from 'node:test';
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
} from 'firebase/firestore';
import { readFile } from 'node:fs/promises';
import { initialRankForPosition } from '../src/modules/storage-v4/rankModel.js';

let testEnv;

const CREATED_AT = '2026-07-30T00:00:00.000Z';
const UPDATED_AT = '2026-08-12T00:00:00.000Z';

function v3Revision(id, overrides = {}) {
  return {
    id,
    createdAt: UPDATED_AT,
    complete: false,
    segmentCount: 0,
    placeCount: 0,
    routeConnectionCount: 0,
    noteCount: 0,
    checklistCount: 0,
    ...overrides,
  };
}

function v3Trip(id, revisionId) {
  return {
    id,
    name: 'Legacy coexistence',
    currency: 'MXN',
    placeOrderVersion: 1,
    createdAt: CREATED_AT,
    updatedAt: UPDATED_AT,
    storageVersion: 3,
    activeRevision: revisionId,
    segmentCount: 0,
    placeCount: 0,
    routeConnectionCount: 0,
    noteCount: 0,
    checklistCount: 0,
    total: 0,
  };
}

function v4Trip(id) {
  return {
    id,
    name: 'Phase K synthetic trip',
    currency: 'MXN',
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

function v4Segment(id = 'segment-1') {
  return {
    id,
    rank: initialRankForPosition(0),
    origin: city('Ciudad de México', 19.4326, -99.1332),
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
  };
}

before(async () => {
  testEnv = await initializeTestEnvironment({
    projectId: 'atlasmap-phase-k-e2e-rules-test',
    firestore: {
      host: '127.0.0.1',
      port: 8080,
      rules: await readFile('firestore-phase-k-e2e.rules', 'utf8'),
    },
  });
});

after(async () => {
  await testEnv?.cleanup();
});

test('rules temporales preservan CRUD v3 existente', async () => {
  const alice = testEnv.authenticatedContext('alice').firestore();
  const tripId = 'legacy-still-works';
  const revisionId = 'revision001';
  const revisionRef = doc(alice, `users/alice/trips/${tripId}/revisions/${revisionId}`);
  const revision = v3Revision(revisionId);

  await assertSucceeds(setDoc(revisionRef, revision));
  await assertSucceeds(setDoc(revisionRef, { ...revision, complete: true }));
  await assertSucceeds(setDoc(
    doc(alice, `users/alice/trips/${tripId}`),
    v3Trip(tripId, revisionId)
  ));
  await assertSucceeds(getDoc(doc(alice, `users/alice/trips/${tripId}`)));
});

test('write v4 normal sigue bloqueado fuera del prefijo Phase K', async () => {
  const alice = testEnv.authenticatedContext('alice').firestore();
  await assertFails(setDoc(
    doc(alice, 'users/alice/trips/normal-v4-trip'),
    v4Trip('normal-v4-trip')
  ));
});

test('solo el trip sintetico Phase K puede crear root y entidad v4', async () => {
  const alice = testEnv.authenticatedContext('alice').firestore();
  const tripId = 'phase-k-e2e-12345678';
  const tripRef = doc(alice, `users/alice/trips/${tripId}`);
  const segmentRef = doc(alice, `users/alice/trips/${tripId}/segments/segment-1`);

  await assertSucceeds(setDoc(tripRef, v4Trip(tripId)));
  await assertSucceeds(setDoc(segmentRef, v4Segment()));
  await assertSucceeds(getDoc(segmentRef));
});

test('prefijo no concede acceso cruzado entre usuarios', async () => {
  const alice = testEnv.authenticatedContext('alice').firestore();
  const bob = testEnv.authenticatedContext('bob').firestore();
  const tripId = 'phase-k-e2e-ownership1';

  await assertSucceeds(setDoc(
    doc(alice, `users/alice/trips/${tripId}`),
    v4Trip(tripId)
  ));
  await assertFails(getDoc(doc(bob, `users/alice/trips/${tripId}`)));
  await assertFails(setDoc(
    doc(bob, `users/alice/trips/${tripId}/segments/bob-segment`),
    v4Segment('bob-segment')
  ));
});

test('un parent v4 no sintetico no habilita children aunque exista', async () => {
  const tripId = 'non-probe-parent';
  await testEnv.withSecurityRulesDisabled(async (context) => {
    await setDoc(doc(context.firestore(), `users/alice/trips/${tripId}`), {
      id: tripId,
      name: 'Admin seeded',
      currency: 'MXN',
      schemaVersion: 4,
      status: 'active',
      version: 1,
      createdAt: new Date(),
      updatedAt: new Date(),
      deletedAt: null,
      purgeAfter: null,
      segmentCount: 0,
      placeCount: 0,
      total: 0,
    });
  });

  const alice = testEnv.authenticatedContext('alice').firestore();
  await assertFails(setDoc(
    doc(alice, `users/alice/trips/${tripId}/segments/segment-1`),
    v4Segment()
  ));
});

test('cleanup hard-delete solo funciona dentro del prefijo sintetico', async () => {
  const alice = testEnv.authenticatedContext('alice').firestore();
  const tripId = 'phase-k-e2e-cleanup01';
  const tripRef = doc(alice, `users/alice/trips/${tripId}`);
  const segmentRef = doc(alice, `users/alice/trips/${tripId}/segments/segment-1`);

  await assertSucceeds(setDoc(tripRef, v4Trip(tripId)));
  await assertSucceeds(setDoc(segmentRef, v4Segment()));
  await assertSucceeds(deleteDoc(segmentRef));
  await assertSucceeds(deleteDoc(tripRef));
});
