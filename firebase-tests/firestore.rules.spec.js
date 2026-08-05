import { after, before, test } from 'node:test';
import {
  assertFails,
  assertSucceeds,
  initializeTestEnvironment,
} from '@firebase/rules-unit-testing';
import { doc, getDoc, setDoc } from 'firebase/firestore';
import { readFile } from 'node:fs/promises';
import { normalizeTrip } from '../src/modules/trips/tripModel.js';

let testEnv;

const validTrip = {
  id: 'trip-1',
  name: 'Viaje de prueba',
  currency: 'MXN',
  segments: [],
  places: [],
  notes: [],
  checklist: [],
  createdAt: '2026-07-30T00:00:00.000Z',
  updatedAt: '2026-07-30T00:00:00.000Z',
};

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

test('un usuario autenticado puede guardar y leer su propio viaje', async () => {
  const alice = testEnv.authenticatedContext('alice').firestore();
  const ref = doc(alice, 'users/alice/trips/trip-1');
  await assertSucceeds(setDoc(ref, validTrip));
  await assertSucceeds(getDoc(ref));
});

test('las reglas aceptan la forma normalizada actual con lugares persistentes', async () => {
  const alice = testEnv.authenticatedContext('alice').firestore();
  const trip = normalizeTrip({
    ...validTrip,
    id: 'trip-with-place',
    places: [{
      id: 'place-1',
      name: 'Museo de prueba',
      city: 'Ciudad de México',
      country: 'México',
      countryCode: 'MX',
      lat: 19.4326,
      lon: -99.1332,
    }],
  });
  await assertSucceeds(setDoc(doc(alice, 'users/alice/trips/trip-with-place'), trip));
});

test('un usuario no puede leer viajes de otro usuario', async () => {
  await testEnv.withSecurityRulesDisabled(async (context) => {
    await setDoc(doc(context.firestore(), 'users/alice/trips/trip-1'), validTrip);
  });
  const bob = testEnv.authenticatedContext('bob').firestore();
  await assertFails(getDoc(doc(bob, 'users/alice/trips/trip-1')));
});

test('un visitante sin autenticar no puede leer ni escribir viajes', async () => {
  const guest = testEnv.unauthenticatedContext().firestore();
  const ref = doc(guest, 'users/alice/trips/trip-1');
  await assertFails(getDoc(ref));
  await assertFails(setDoc(ref, validTrip));
});

test('las reglas rechazan documentos con campos inesperados', async () => {
  const alice = testEnv.authenticatedContext('alice').firestore();
  await assertFails(setDoc(doc(alice, 'users/alice/trips/trip-invalid'), {
    ...validTrip,
    id: 'trip-invalid',
    privateAdminFlag: true,
  }));
});

test('las reglas rechazan más de 500 lugares', async () => {
  const alice = testEnv.authenticatedContext('alice').firestore();
  await assertFails(setDoc(doc(alice, 'users/alice/trips/trip-too-many-places'), {
    ...validTrip,
    id: 'trip-too-many-places',
    places: Array.from({ length: 501 }, (_, index) => ({ id: `place-${index}` })),
  }));
});

test('createdAt no puede modificarse después de crear el viaje', async () => {
  const alice = testEnv.authenticatedContext('alice').firestore();
  const ref = doc(alice, 'users/alice/trips/trip-1');
  await assertSucceeds(setDoc(ref, validTrip));
  await assertFails(setDoc(ref, { ...validTrip, createdAt: '2030-01-01T00:00:00.000Z' }));
});
