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
    projectId: 'atlasmap-v4-internal-rules-test',
    firestore: {
      host: '127.0.0.1',
      port: 8080,
      rules: await readFile('firestore-v4.rules', 'utf8'),
    },
  });
});

after(async () => {
  await testEnv?.cleanup();
});

test('clientes no pueden leer ni falsificar contribuciones internas de agregados', async () => {
  const alice = testEnv.authenticatedContext('alice').firestore();
  const ref = doc(
    alice,
    'users/alice/trips/trip-1/__aggregateContributions/segment%3Asegment-1'
  );
  await assertFails(getDoc(ref));
  await assertFails(setDoc(ref, {
    entityType: 'segment',
    entityId: 'segment-1',
    version: 999,
    countContribution: 999,
    valueContribution: 999999,
  }));
});
