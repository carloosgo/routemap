import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import {
  V4_PILOT_BACKEND_FUNCTION_NAMES,
  createV4PilotBackendBundle,
} from './v4PilotBackendBundle.js';

test('bundle pilot compone ingress privado, lifecycle y purge', () => {
  const calls = [];
  const bundle = createV4PilotBackendBundle({
    adminDb: { fake: true },
    serviceRegion: 'us-central1',
    ingressFactory({ adminDb, region }) {
      calls.push(['ingress', adminDb, region]);
      return { name: 'ingress' };
    },
    lifecycleFactory({ adminDb, region }) {
      calls.push(['lifecycle', adminDb, region]);
      return { name: 'lifecycle' };
    },
    purgeFactory({ db, region }) {
      calls.push(['purge', db, region]);
      return { name: 'purge' };
    },
  });

  assert.deepEqual(Object.keys(bundle), V4_PILOT_BACKEND_FUNCTION_NAMES);
  assert.deepEqual(
    V4_PILOT_BACKEND_FUNCTION_NAMES,
    ['v4FirestoreEventIngress', 'v4TripLifecycle', 'v4TripPurge']
  );
  assert.deepEqual(calls.map(([kind]) => kind), ['ingress', 'lifecycle', 'purge']);
  assert.deepEqual(calls.map(([, , region]) => region), [
    'us-central1',
    'us-central1',
    'us-central1',
  ]);
  assert.equal(Object.isFrozen(bundle), true);
});

test('bundle pilot sigue fuera de functions/index.js hasta autorización explícita', async () => {
  const indexSource = await readFile(new URL('./index.js', import.meta.url), 'utf8');
  assert.doesNotMatch(indexSource, /v4PilotBackendBundle/);
  assert.doesNotMatch(indexSource, /v4FirestoreEventIngressFunction/);
  assert.doesNotMatch(indexSource, /v4TripLifecycleFunction/);
  assert.doesNotMatch(indexSource, /v4TripPurgeScheduler/);
});
