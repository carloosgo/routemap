import { after, before, test } from 'node:test';
import {
  assertFails,
  assertSucceeds,
  initializeTestEnvironment,
} from '@firebase/rules-unit-testing';
import { doc, getDoc, setDoc } from 'firebase/firestore';
import { readFile } from 'node:fs/promises';

let testEnv;

const CREATED_AT = '2026-07-30T00:00:00.000Z';
const UPDATED_AT = '2026-08-05T00:00:00.000Z';

function revisionData(id, overrides = {}) {
  return {
    id,
    createdAt: UPDATED_AT,
    complete: false,
    segmentCount: 0,
    placeCount: 0,
    noteCount: 0,
    checklistCount: 0,
    ...overrides,
  };
}

function tripSummary(id, revisionId, overrides = {}) {
  return {
    id,
    name: 'Viaje de prueba',
    currency: 'MXN',
    placeOrderVersion: 1,
    createdAt: CREATED_AT,
    updatedAt: UPDATED_AT,
    storageVersion: 2,
    activeRevision: revisionId,
    segmentCount: 0,
    placeCount: 0,
    noteCount: 0,
    checklistCount: 0,
    total: 0,
    ...overrides,
  };
}

function segmentData(id = 'segment-1', position = 0) {
  return {
    id,
    position,
    origin: { name: 'Ciudad de México', lat: 19.4326, lon: -99.1332 },
    destination: { name: 'Puebla', lat: 19.0414, lon: -98.2063 },
    startDate: '',
    endDate: '',
    expenses: {
      lodging: 0,
      food: { mode: 'single', single: 0, breakfast: 0, lunch: 0, dinner: 0 },
      transport: { plane: 0, train: 0, bus: 0, taxiUber: 0 },
      transportOthers: [],
      attractions: [],
      others: [],
    },
    note: '',
  };
}

function placeData(id = 'place-1', position = 0) {
  return {
    id,
    position,
    name: 'Museo de prueba',
    address: '',
    city: 'Ciudad de México',
    country: 'México',
    category: 'museum',
    countryCode: 'MX',
    lat: 19.4326,
    lon: -99.1332,
    savedAt: UPDATED_AT,
  };
}

async function createCompleteRevision(db, tripId, revisionId, counts = {}) {
  const revisionRef = doc(db, `users/alice/trips/${tripId}/revisions/${revisionId}`);
  const revision = revisionData(revisionId, counts);
  await assertSucceeds(setDoc(revisionRef, revision));
  await assertSucceeds(setDoc(revisionRef, { ...revision, complete: true }));
}

before(async () => {
  testEnv = await initializeTestEnvironment({
    projectId: 'atlasmap-dev',
    firestore: {
      host: '127.0.0.1',
      port: 8080,
      rules: await readFile('firestore.rules', 'utf8'),
    },
  });
});

after(async () => {
  await testEnv?.cleanup();
});

test('un usuario autenticado puede cerrar una revisión y publicar su viaje', async () => {
  const alice = testEnv.authenticatedContext('alice').firestore();
  const tripId = 'trip-versioned';
  const revisionId = 'revision001';
  const revisionRef = doc(alice, `users/alice/trips/${tripId}/revisions/${revisionId}`);
  const revision = revisionData(revisionId, { segmentCount: 1 });

  await assertSucceeds(setDoc(revisionRef, revision));
  await assertSucceeds(setDoc(
    doc(alice, `users/alice/trips/${tripId}/revisions/${revisionId}/segments/000000`),
    segmentData()
  ));
  await assertSucceeds(setDoc(revisionRef, { ...revision, complete: true }));
  await assertSucceeds(setDoc(
    doc(alice, `users/alice/trips/${tripId}`),
    tripSummary(tripId, revisionId, { segmentCount: 1 })
  ));
  await assertSucceeds(getDoc(doc(alice, `users/alice/trips/${tripId}`)));
});

test('los tramos rechazan campos de routing pertenecientes a otros dominios', async () => {
  const alice = testEnv.authenticatedContext('alice').firestore();
  const tripId = 'trip-route-separated';
  const revisionId = 'revision011';
  const revisionRef = doc(alice, `users/alice/trips/${tripId}/revisions/${revisionId}`);

  await assertSucceeds(setDoc(revisionRef, revisionData(revisionId)));
  await assertFails(setDoc(
    doc(alice, `users/alice/trips/${tripId}/revisions/${revisionId}/segments/000000`),
    {
      ...segmentData(),
      route: {
        signature: 'foreign-domain-route',
        mode: 'drive',
        geometry: '{}',
        distance: 1,
        duration: 1,
        calculatedAt: UPDATED_AT,
      },
    }
  ));
});

test('los lugares se guardan como documentos independientes de la revisión', async () => {
  const alice = testEnv.authenticatedContext('alice').firestore();
  const tripId = 'trip-with-place';
  const revisionId = 'revision002';
  const revisionRef = doc(alice, `users/alice/trips/${tripId}/revisions/${revisionId}`);
  const revision = revisionData(revisionId, { placeCount: 1 });
  const placeRef = doc(
    alice,
    `users/alice/trips/${tripId}/revisions/${revisionId}/places/000000`
  );

  await assertSucceeds(setDoc(revisionRef, revision));
  await assertSucceeds(setDoc(placeRef, placeData()));
  await assertSucceeds(setDoc(revisionRef, { ...revision, complete: true }));
  await assertSucceeds(setDoc(
    doc(alice, `users/alice/trips/${tripId}`),
    tripSummary(tripId, revisionId, { placeCount: 1 })
  ));
  await assertSucceeds(getDoc(placeRef));
});

test('un viaje no puede apuntar a una revisión incompleta', async () => {
  const alice = testEnv.authenticatedContext('alice').firestore();
  const tripId = 'trip-incomplete';
  const revisionId = 'revision003';
  await assertSucceeds(setDoc(
    doc(alice, `users/alice/trips/${tripId}/revisions/${revisionId}`),
    revisionData(revisionId)
  ));
  await assertFails(setDoc(
    doc(alice, `users/alice/trips/${tripId}`),
    tripSummary(tripId, revisionId)
  ));
});

test('una revisión completa ya no admite nuevos elementos ni reapertura', async () => {
  const alice = testEnv.authenticatedContext('alice').firestore();
  const tripId = 'trip-immutable';
  const revisionId = 'revision004';
  const revisionRef = doc(alice, `users/alice/trips/${tripId}/revisions/${revisionId}`);
  const revision = revisionData(revisionId);
  await assertSucceeds(setDoc(revisionRef, revision));
  await assertSucceeds(setDoc(revisionRef, { ...revision, complete: true }));

  await assertFails(setDoc(
    doc(alice, `users/alice/trips/${tripId}/revisions/${revisionId}/segments/000000`),
    segmentData()
  ));
  await assertFails(setDoc(revisionRef, revision));
});

test('un usuario no puede leer el viaje ni las revisiones de otro usuario', async () => {
  await testEnv.withSecurityRulesDisabled(async (context) => {
    const db = context.firestore();
    await setDoc(
      doc(db, 'users/alice/trips/private-trip'),
      tripSummary('private-trip', 'revision005')
    );
    await setDoc(
      doc(db, 'users/alice/trips/private-trip/revisions/revision005'),
      revisionData('revision005', { complete: true })
    );
  });
  const bob = testEnv.authenticatedContext('bob').firestore();
  await assertFails(getDoc(doc(bob, 'users/alice/trips/private-trip')));
  await assertFails(getDoc(doc(
    bob,
    'users/alice/trips/private-trip/revisions/revision005'
  )));
});

test('un visitante sin autenticar no puede leer ni escribir viajes o revisiones', async () => {
  const guest = testEnv.unauthenticatedContext().firestore();
  await assertFails(getDoc(doc(guest, 'users/alice/trips/trip-guest')));
  await assertFails(setDoc(
    doc(guest, 'users/alice/trips/trip-guest/revisions/revision006'),
    revisionData('revision006')
  ));
});

test('ningún cliente puede leer o escribir colecciones internas del backend', async () => {
  const alice = testEnv.authenticatedContext('alice').firestore();
  const internalPaths = [
    'geocodeCache/cache-1',
    'placeSearchCache/cache-1',
    'placeDetailsCache/cache-1',
    'routeCache/cache-1',
    'countryBoundaryCache/cache-1',
    'functionRateLimits/rate-1',
    'geoapifyBatchJobs/job-1',
  ];

  for (const path of internalPaths) {
    const ref = doc(alice, path);
    await assertFails(getDoc(ref));
    await assertFails(setDoc(ref, { expiresAt: new Date() }));
  }
});

test('las reglas rechazan resúmenes con campos inesperados o conteos excesivos', async () => {
  const alice = testEnv.authenticatedContext('alice').firestore();
  const tripId = 'trip-invalid-summary';
  const revisionId = 'revision007';
  await createCompleteRevision(alice, tripId, revisionId);

  await assertFails(setDoc(doc(alice, `users/alice/trips/${tripId}`), {
    ...tripSummary(tripId, revisionId),
    privateAdminFlag: true,
  }));
  await assertFails(setDoc(doc(alice, `users/alice/trips/${tripId}`),
    tripSummary(tripId, revisionId, { placeCount: 501 })
  ));
  await assertFails(setDoc(doc(alice, `users/alice/trips/${tripId}`),
    tripSummary(tripId, revisionId, { placeOrderVersion: 2 })
  ));
});

test('createdAt no puede modificarse después de publicar el viaje', async () => {
  const alice = testEnv.authenticatedContext('alice').firestore();
  const tripId = 'trip-created-at';
  const firstRevision = 'revision008';
  const secondRevision = 'revision009';
  await createCompleteRevision(alice, tripId, firstRevision);
  const tripRef = doc(alice, `users/alice/trips/${tripId}`);
  await assertSucceeds(setDoc(tripRef, tripSummary(tripId, firstRevision)));
  await createCompleteRevision(alice, tripId, secondRevision);
  await assertFails(setDoc(tripRef, tripSummary(tripId, secondRevision, {
    createdAt: '2030-01-01T00:00:00.000Z',
  })));
});

test('un viaje legado puede leerse y migrarse en su siguiente guardado', async () => {
  const tripId = 'trip-legacy';
  await testEnv.withSecurityRulesDisabled(async (context) => {
    await setDoc(doc(context.firestore(), `users/alice/trips/${tripId}`), {
      id: tripId,
      name: 'Viaje legado',
      currency: 'MXN',
      segments: [],
      places: [],
      notes: [],
      checklist: [],
      createdAt: CREATED_AT,
      updatedAt: CREATED_AT,
    });
  });

  const alice = testEnv.authenticatedContext('alice').firestore();
  await assertSucceeds(getDoc(doc(alice, `users/alice/trips/${tripId}`)));
  const revisionId = 'revision010';
  await createCompleteRevision(alice, tripId, revisionId);
  await assertSucceeds(setDoc(
    doc(alice, `users/alice/trips/${tripId}`),
    tripSummary(tripId, revisionId)
  ));
});
