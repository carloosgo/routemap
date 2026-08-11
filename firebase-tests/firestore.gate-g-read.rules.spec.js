import { after, before, beforeEach, test } from 'node:test';
import assert from 'node:assert/strict';
import {
  assertFails,
  assertSucceeds,
  initializeTestEnvironment,
} from '@firebase/rules-unit-testing';
import { doc, getDoc, setDoc } from 'firebase/firestore';
import { readFile } from 'node:fs/promises';
import { composeGateGReadRules } from '../scripts/firestoreGateGReadRules.mjs';
import { createFirestoreTripRepository } from '../src/infrastructure/firebase/firestoreTripRepository.js';
import { createExpenses } from '../src/modules/expenses/expenseModel.js';

let testEnv;

function v3Trip() {
  return {
    id: 'trip-v3-write',
    name: 'V3 sigue escribiendo',
    currency: 'EUR',
    placeOrderVersion: 1,
    createdAt: '2026-08-10T20:00:00.000Z',
    updatedAt: '2026-08-10T20:00:00.000Z',
    segments: [{
      id: 'segment-v3',
      origin: null,
      destination: null,
      startDate: '',
      endDate: '',
      expenses: createExpenses(),
      note: '',
    }],
    places: [],
    routeConnections: [],
    notes: [],
    checklist: [],
  };
}

before(async () => {
  const activeRules = await readFile('firestore.rules', 'utf8');
  testEnv = await initializeTestEnvironment({
    projectId: 'atlasmap-gate-g-read-test',
    firestore: {
      host: '127.0.0.1',
      port: 8080,
      rules: composeGateGReadRules(activeRules),
    },
  });
});

beforeEach(async () => {
  await testEnv.clearFirestore();
});

after(async () => {
  await testEnv?.cleanup();
});

test('Gate G READ conserva las escrituras v3 existentes', async () => {
  const db = testEnv.authenticatedContext('alice').firestore();
  const repository = createFirestoreTripRepository({ db, uid: 'alice' });
  const trip = v3Trip();

  await repository.save(trip);
  const loaded = await repository.get(trip.id);
  assert.equal(loaded.id, trip.id);
  assert.equal(loaded.segments[0].id, 'segment-v3');
});

test('Gate G READ permite leer entidades v4 al dueño pero niega a otro usuario', async () => {
  await testEnv.withSecurityRulesDisabled(async (context) => {
    const adminDb = context.firestore();
    await setDoc(doc(adminDb, 'users', 'alice', 'trips', 'trip-v4'), {
      id: 'trip-v4',
      name: 'V4',
      currency: 'EUR',
      schemaVersion: 4,
      status: 'active',
      version: 1,
    });
    await setDoc(doc(adminDb, 'users', 'alice', 'trips', 'trip-v4', 'notes', 'note-1'), {
      id: 'note-1',
      title: 'Privado',
      text: 'Contenido',
      status: 'active',
      version: 1,
    });
  });

  const aliceDb = testEnv.authenticatedContext('alice').firestore();
  const bobDb = testEnv.authenticatedContext('bob').firestore();
  await assertSucceeds(getDoc(doc(aliceDb, 'users', 'alice', 'trips', 'trip-v4')));
  await assertSucceeds(getDoc(doc(aliceDb, 'users', 'alice', 'trips', 'trip-v4', 'notes', 'note-1')));
  await assertFails(getDoc(doc(bobDb, 'users', 'alice', 'trips', 'trip-v4')));
  await assertFails(getDoc(doc(bobDb, 'users', 'alice', 'trips', 'trip-v4', 'notes', 'note-1')));
});

test('Gate G READ mantiene bloqueadas todas las escrituras directas v4 del cliente', async () => {
  await testEnv.withSecurityRulesDisabled(async (context) => {
    await setDoc(doc(context.firestore(), 'users', 'alice', 'trips', 'trip-v4'), {
      id: 'trip-v4',
      name: 'V4',
      currency: 'EUR',
      schemaVersion: 4,
      status: 'active',
      version: 1,
    });
  });

  const db = testEnv.authenticatedContext('alice').firestore();
  await assertFails(setDoc(
    doc(db, 'users', 'alice', 'trips', 'trip-v4', 'notes', 'note-client'),
    { id: 'note-client', text: 'No permitido' }
  ));
  await assertFails(setDoc(
    doc(db, 'users', 'alice', 'trips', 'new-v4'),
    { id: 'new-v4', schemaVersion: 4, name: 'No permitido' }
  ));
});
