import { after, before, test } from 'node:test';
import {
  assertFails,
  initializeTestEnvironment,
} from '@firebase/rules-unit-testing';
import { doc, getDoc, setDoc } from 'firebase/firestore';
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
