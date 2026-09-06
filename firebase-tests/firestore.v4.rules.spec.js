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
  updateDoc,
} from 'firebase/firestore';
import { readFile } from 'node:fs/promises';
import { initialRankForPosition } from '../src/modules/storage-v4/rankModel.js';

let testEnv;

function tripData(id, overrides = {}) {
  return {
    id,
    name: 'Viaje v4',
    currency: 'MXN',
    origin: null,
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

function lifecycle(overrides = {}) {
  return {
    status: 'active',
    version: 1,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
    deletedAt: null,
    ...overrides,
  };
}

function segmentData(id = 'segment-1', overrides = {}) {
  return {
    id,
    rank: initialRankForPosition(0),
    destination: city('Puebla', 19.0414, -98.2063),
    startDate: '2026-12-01',
    endDate: '2026-12-02',
    expenses: expenses(),
    note: '',
    ...lifecycle(),
    ...overrides,
  };
}

function googlePlaceData(id = 'place-google', overrides = {}) {
  return {
    id,
    rank: initialRankForPosition(0),
    provider: 'google',
    googlePlaceId: 'ChIJ-reference',
    userLabel: 'Allianz Arena',
    name: '',
    address: '',
    city: '',
    country: '',
    category: '',
    countryCode: '',
    lat: null,
    lon: null,
    savedAt: '2026-08-10T00:00:00.000Z',
    ...lifecycle(),
    ...overrides,
  };
}

async function createTrip(db, id = 'trip-v4') {
  const ref = doc(db, `users/alice/trips/${id}`);
  await assertSucceeds(setDoc(ref, tripData(id)));
  return ref;
}

before(async () => {
  testEnv = await initializeTestEnvironment({
    projectId: 'atlasmap-v4-rules-test',
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

test('v4 crea un resumen vacío propio y rechaza agregados falsificados', async () => {
  const alice = testEnv.authenticatedContext('alice').firestore();
  await createTrip(alice, 'trip-create-ok');

  await assertFails(setDoc(
    doc(alice, 'users/alice/trips/trip-forged-total'),
    tripData('trip-forged-total', { total: 999 })
  ));
  await assertFails(setDoc(
    doc(alice, 'users/alice/trips/trip-forged-count'),
    tripData('trip-forged-count', { segmentCount: 2 })
  ));
});

test('origen canónico pertenece al root v4 y nunca a segments', async () => {
  const alice = testEnv.authenticatedContext('alice').firestore();
  const rootOrigin = city('Ciudad de México', 19.4326, -99.1332);

  await assertSucceeds(setDoc(
    doc(alice, 'users/alice/trips/trip-origin-create'),
    tripData('trip-origin-create', { origin: rootOrigin })
  ));
  await assertFails(setDoc(
    doc(alice, 'users/alice/trips/trip-origin-invalid'),
    tripData('trip-origin-invalid', {
      origin: { ...rootOrigin, providerPayload: 'no-canonical' },
    })
  ));

  const rootRef = await createTrip(alice, 'trip-origin-update');
  await assertSucceeds(updateDoc(rootRef, {
    origin: rootOrigin,
    version: 2,
    updatedAt: serverTimestamp(),
  }));
  await assertSucceeds(updateDoc(rootRef, {
    origin: null,
    version: 3,
    updatedAt: serverTimestamp(),
  }));

  await assertFails(setDoc(
    doc(alice, 'users/alice/trips/trip-origin-update/segments/segment-with-origin'),
    segmentData('segment-with-origin', { origin: rootOrigin })
  ));
});

test('metadata del viaje avanza una versión y no puede alterar agregados', async () => {
  const alice = testEnv.authenticatedContext('alice').firestore();
  const ref = await createTrip(alice, 'trip-metadata');

  await assertSucceeds(updateDoc(ref, {
    name: 'Viaje renombrado',
    version: 2,
    updatedAt: serverTimestamp(),
  }));
  await assertFails(updateDoc(ref, {
    name: 'Versión obsoleta',
    version: 2,
    updatedAt: serverTimestamp(),
  }));
  await assertFails(updateDoc(ref, {
    total: 100,
    version: 3,
    updatedAt: serverTimestamp(),
  }));
  await assertFails(deleteDoc(ref));
});

test('segmentos permiten update versionado, tombstone y restore, nunca hard delete', async () => {
  const alice = testEnv.authenticatedContext('alice').firestore();
  await createTrip(alice, 'trip-segment');
  const ref = doc(alice, 'users/alice/trips/trip-segment/segments/segment-1');

  await assertSucceeds(setDoc(ref, segmentData()));
  await assertSucceeds(updateDoc(ref, {
    note: 'Comprar billetes',
    version: 2,
    updatedAt: serverTimestamp(),
  }));
  await assertFails(updateDoc(ref, {
    note: 'Escritura stale',
    version: 2,
    updatedAt: serverTimestamp(),
  }));
  await assertSucceeds(updateDoc(ref, {
    status: 'deleted',
    deletedAt: serverTimestamp(),
    version: 3,
    updatedAt: serverTimestamp(),
  }));
  await assertSucceeds(updateDoc(ref, {
    status: 'active',
    deletedAt: null,
    version: 4,
    updatedAt: serverTimestamp(),
  }));
  await assertFails(deleteDoc(ref));
});

test('un hijo no puede existir sin un viaje v4 activo', async () => {
  const alice = testEnv.authenticatedContext('alice').firestore();
  await assertFails(setDoc(
    doc(alice, 'users/alice/trips/missing/segments/segment-1'),
    segmentData()
  ));

  await createTrip(alice, 'trip-deleted-parent');
  await testEnv.withSecurityRulesDisabled(async (context) => {
    await updateDoc(doc(context.firestore(), 'users/alice/trips/trip-deleted-parent'), {
      status: 'deleted',
      deletedAt: new Date(),
    });
  });
  await assertFails(setDoc(
    doc(alice, 'users/alice/trips/trip-deleted-parent/segments/segment-1'),
    segmentData()
  ));
});

test('Google Places persiste referencia y etiqueta, no payload copiado del proveedor', async () => {
  const alice = testEnv.authenticatedContext('alice').firestore();
  await createTrip(alice, 'trip-places');

  await assertSucceeds(setDoc(
    doc(alice, 'users/alice/trips/trip-places/places/place-google'),
    googlePlaceData()
  ));
  await assertFails(setDoc(
    doc(alice, 'users/alice/trips/trip-places/places/place-invalid'),
    googlePlaceData('place-invalid', {
      name: 'Nombre copiado',
      lat: 48.2188,
      lon: 11.6247,
    })
  ));
});

test('connections v4 guardan intención y rechazan geometría/proveedor dinámico', async () => {
  const alice = testEnv.authenticatedContext('alice').firestore();
  await createTrip(alice, 'trip-connections');
  const base = {
    id: 'connection-1',
    rank: initialRankForPosition(0),
    fromPlaceId: 'place-1',
    toPlaceId: 'place-2',
    mode: 'transit',
    visible: true,
    ...lifecycle(),
  };

  await assertSucceeds(setDoc(
    doc(alice, 'users/alice/trips/trip-connections/connections/connection-1'),
    base
  ));
  await assertFails(setDoc(
    doc(alice, 'users/alice/trips/trip-connections/connections/connection-2'),
    { ...base, id: 'connection-2', geometryJson: '{"type":"LineString"}' }
  ));
  await assertFails(setDoc(
    doc(alice, 'users/alice/trips/trip-connections/connections/connection-3'),
    { ...base, id: 'connection-3', mode: 'plane' }
  ));
});

test('notas y checklist usan documentos independientes versionados', async () => {
  const alice = testEnv.authenticatedContext('alice').firestore();
  await createTrip(alice, 'trip-notes');

  await assertSucceeds(setDoc(
    doc(alice, 'users/alice/trips/trip-notes/notes/note-1'),
    {
      id: 'note-1',
      rank: initialRankForPosition(0),
      title: 'Reservas',
      text: 'Comprar entradas',
      ...lifecycle(),
    }
  ));
  await assertSucceeds(setDoc(
    doc(alice, 'users/alice/trips/trip-notes/checklist/item-1'),
    {
      id: 'item-1',
      rank: initialRankForPosition(0),
      text: 'Pasaporte',
      done: false,
      ...lifecycle(),
    }
  ));
});

test('aislamiento por UID y visitante sin sesión permanecen cerrados', async () => {
  const alice = testEnv.authenticatedContext('alice').firestore();
  await createTrip(alice, 'trip-private-v4');

  const bob = testEnv.authenticatedContext('bob').firestore();
  const guest = testEnv.unauthenticatedContext().firestore();
  await assertFails(getDoc(doc(bob, 'users/alice/trips/trip-private-v4')));
  await assertFails(setDoc(
    doc(bob, 'users/alice/trips/trip-private-v4/segments/segment-bob'),
    segmentData('segment-bob')
  ));
  await assertFails(getDoc(doc(guest, 'users/alice/trips/trip-private-v4')));
});
