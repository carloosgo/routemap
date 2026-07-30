import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import {
  assertFails,
  assertSucceeds,
  initializeTestEnvironment,
} from '@firebase/rules-unit-testing';
import { doc, getDoc, setDoc } from 'firebase/firestore';
import { readFile } from 'node:fs/promises';

let testEnv;

const validTrip = {
  id: 'trip-1',
  name: 'Viaje de prueba',
  currency: 'MXN',
  segments: [],
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
  const ref = doc(alice, 'users/alice/trips/trip-invalid');

  await assertFails(
    setDoc(ref, {
      ...validTrip,
      id: 'trip-invalid',
      privateAdminFlag: true,
    })
  );
});

test('createdAt no puede modificarse después de crear el viaje', async () => {
  const alice = testEnv.authenticatedContext('alice').firestore();
  const ref = doc(alice, 'users/alice/trips/trip-1');

  await assertSucceeds(setDoc(ref, validTrip));
  await assertFails(setDoc(ref, { ...validTrip, createdAt: '2030-01-01T00:00:00.000Z' }));
  assert.ok(true);
});
