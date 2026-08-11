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

async function assertBackendOnly(path, payload = { marker: true }) {
  const alice = testEnv.authenticatedContext('alice').firestore();
  const ref = doc(alice, path);
  await assertFails(getDoc(ref));
  await assertFails(setDoc(ref, payload));
}

test('clientes no pueden leer ni falsificar contribuciones internas de agregados', async () => {
  await assertBackendOnly(
    'users/alice/trips/trip-1/__aggregateContributions/segment%3Asegment-1',
    {
      entityType: 'segment',
      entityId: 'segment-1',
      version: 999,
      countContribution: 999,
      valueContribution: 999999,
    }
  );
});

test('checkpoints de migración v4 son exclusivamente backend', async () => {
  await assertBackendOnly('users/alice/__tripMigrations/trip-1', {
    state: 'complete',
    expectedDigest: 'fake',
  });
});

test('jobs de purga v4 son exclusivamente backend', async () => {
  await assertBackendOnly('users/alice/__tripPurgeJobs/trip-1', {
    state: 'claimed',
  });
});

test('operaciones idempotentes de lifecycle bajo un viaje son exclusivamente backend', async () => {
  await assertBackendOnly('users/alice/trips/trip-1/__lifecycleOperations/delete-op-1', {
    operationId: 'delete-op-1',
    resultVersion: 2,
  });
});
