import { after, before, test } from 'node:test';
import {
  assertFails,
  assertSucceeds,
  initializeTestEnvironment,
} from '@firebase/rules-unit-testing';
import {
  collection,
  doc,
  getDoc,
  getDocs,
  serverTimestamp,
  setDoc,
  updateDoc,
} from 'firebase/firestore';
import { readFile } from 'node:fs/promises';

let testEnv;

before(async () => {
  testEnv = await initializeTestEnvironment({
    projectId: 'atlasmap-dev-internal-collections',
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

test('las colecciones internas de caché y catálogo no son accesibles desde el cliente', async () => {
  const alice = testEnv.authenticatedContext('alice').firestore();
  const paths = [
    'citySearchCache/cache-1',
    'cityCatalog/city-1',
    'cityCatalogProviderRefs/provider-1',
    'cityCatalogQueries/query-1',
    'googlePlaceLocationCache/cache-1',
    'googleCountryPlaceIdCache/cache-1',
    'googleCountryPlaceIdCacheV3/cache-1',
    'googleCountryRegionPlaceIdCache/cache-1',
  ];

  for (const path of paths) {
    const ref = doc(alice, path);
    await assertFails(getDoc(ref));
    await assertFails(setDoc(ref, {
      result: [],
      expiresAt: new Date(),
    }));
  }
});

function itineraryShare(ownerId = 'alice') {
  return {
    schemaVersion: 1,
    ownerId,
    intlLocale: 'es-MX',
    model: {
      name: 'Europa 2026',
      currency: 'MXN',
      hasOrigin: false,
      origin: null,
      stops: [
        {
          number: 1,
          name: 'París',
          countryCode: 'FR',
          startDate: '2026-11-30',
          endDate: '2026-12-02',
          nights: 2,
          total: 2500,
          lat: 48.8566,
          lon: 2.3522,
          note: 'Llegar temprano.',
          color: '#d84b55',
        },
      ],
      summary: {
        startDate: '2026-11-30',
        endDate: '2026-12-13',
        countries: 5,
        destinations: 13,
        nights: 12,
      },
      total: 6460,
    },
    createdAt: serverTimestamp(),
  };
}

test('un share de itinerario es público sólo por get y únicamente su dueño puede crearlo', async () => {
  const alice = testEnv.authenticatedContext('alice').firestore();
  const bob = testEnv.authenticatedContext('bob').firestore();
  const publicDb = testEnv.unauthenticatedContext().firestore();
  const aliceRef = doc(alice, 'itineraryShares/share-public-1');

  await assertSucceeds(setDoc(aliceRef, itineraryShare('alice')));
  await assertSucceeds(getDoc(doc(publicDb, 'itineraryShares/share-public-1')));
  await assertFails(getDocs(collection(publicDb, 'itineraryShares')));
  await assertFails(setDoc(
    doc(publicDb, 'itineraryShares/anonymous-write'),
    itineraryShare('anonymous')
  ));
  await assertFails(setDoc(
    doc(bob, 'itineraryShares/forged-owner'),
    itineraryShare('alice')
  ));
  await assertFails(updateDoc(aliceRef, { intlLocale: 'en-US' }));
});
