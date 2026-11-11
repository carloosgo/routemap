import { after, before, test } from 'node:test';
import {
  assertFails,
  assertSucceeds,
  initializeTestEnvironment,
} from '@firebase/rules-unit-testing';
import { collection, doc, getDoc, getDocs, serverTimestamp, setDoc, updateDoc } from 'firebase/firestore';
import { readFile } from 'node:fs/promises';
import { buildPublicDayShareModel } from '../src/modules/share/dayRouteShare.js';

let testEnv;

before(async () => {
  testEnv = await initializeTestEnvironment({
    projectId: 'atlasmap-dev-day-shares',
    firestore: { host: '127.0.0.1', port: 8080, rules: await readFile('firestore.rules', 'utf8') },
  });
});

after(async () => {
  await testEnv?.cleanup();
});

function model(name = 'Notre-Dame') {
  return buildPublicDayShareModel({
    title: 'Día 11 · viernes, 11 de diciembre',
    subtitle: 'París',
    cities: [{ name: 'París', countryCode: 'FR' }],
    places: [
      { id: 'a', name, lat: 48.853, lon: 2.3499, googlePlaceId: 'g1' },
      { id: 'b', name: 'Shakespeare and Company', lat: 48.8526, lon: 2.3471 },
    ],
    routeFor: () => ({
      mode: 'transit',
      distance: 300,
      duration: 240,
      transitSteps: [{ lineShortName: '4', lineColor: '#BE418D', departureStop: 'Cité', arrivalStop: 'Saint-Michel', stopCount: 1 }],
      segments: [{ kind: 'transit', color: '#BE418D', geometry: { coordinates: [[2.3499, 48.853], [2.3471, 48.8526]] } }],
    }),
    colorFor: () => '#c24e36',
  });
}

function dayShare(ownerId) {
  return { schemaVersion: 1, ownerId, intlLocale: 'es-MX', model: model(), createdAt: serverTimestamp() };
}

test('un día compartido es público por get y solo su dueño puede crearlo y actualizarlo', async () => {
  const alice = testEnv.authenticatedContext('alice').firestore();
  const bob = testEnv.authenticatedContext('bob').firestore();
  const publicDb = testEnv.unauthenticatedContext().firestore();
  const aliceRef = doc(alice, 'dayShares', 'stable-alice-day');

  await assertSucceeds(setDoc(aliceRef, dayShare('alice')));
  await assertSucceeds(getDoc(doc(publicDb, 'dayShares', aliceRef.id)));
  await assertFails(getDocs(collection(publicDb, 'dayShares')));
  await assertFails(setDoc(doc(publicDb, 'dayShares/anonymous'), dayShare('anonymous')));
  await assertFails(setDoc(doc(bob, 'dayShares/forged'), dayShare('alice')));

  await assertSucceeds(updateDoc(aliceRef, { model: model('Notre-Dame de Paris'), intlLocale: 'en-US' }));
  await assertFails(updateDoc(doc(bob, 'dayShares', aliceRef.id), { model: model('hack') }));
  await assertFails(updateDoc(aliceRef, { ownerId: 'bob' }));
  await assertFails(updateDoc(aliceRef, { createdAt: serverTimestamp() }));
  await assertFails(updateDoc(aliceRef, { model: { ...model(), places: [] } }));
});
