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

function dayShare(ownerId) {
  const places = [
    { id: 'a', name: 'Notre-Dame', address: 'Paris', lat: 48.853, lon: 2.3499, googlePlaceId: 'g1' },
    { id: 'b', name: 'Shakespeare and Company', lat: 48.8526, lon: 2.3471 },
  ];
  return {
    schemaVersion: 1,
    ownerId,
    intlLocale: 'es-MX',
    model: buildPublicDayShareModel({
      title: 'Día 11 · viernes, 11 de diciembre',
      subtitle: 'París',
      places,
      routeFor: () => ({ mode: 'walk', distance: 300, duration: 240, geometry: null }),
      colorFor: () => '#c24e36',
    }),
    createdAt: serverTimestamp(),
  };
}

test('un día compartido es público por get y solo su dueño puede crearlo', async () => {
  const alice = testEnv.authenticatedContext('alice').firestore();
  const bob = testEnv.authenticatedContext('bob').firestore();
  const publicDb = testEnv.unauthenticatedContext().firestore();
  const aliceRef = doc(collection(alice, 'dayShares'));

  await assertSucceeds(setDoc(aliceRef, dayShare('alice')));
  await assertSucceeds(getDoc(doc(publicDb, 'dayShares', aliceRef.id)));
  await assertFails(getDocs(collection(publicDb, 'dayShares')));
  await assertFails(setDoc(doc(publicDb, 'dayShares/anonymous'), dayShare('anonymous')));
  await assertFails(setDoc(doc(bob, 'dayShares/forged'), dayShare('alice')));
  await assertFails(updateDoc(aliceRef, { intlLocale: 'en-US' }));
});
