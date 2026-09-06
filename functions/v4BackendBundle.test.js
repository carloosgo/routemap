// test-contract: behavior
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  V4_BACKEND_FUNCTION_NAMES,
  createV4BackendBundle,
} from './v4BackendBundle.js';

test('backend v4 canónico compone ingress, lifecycle y purge', () => {
  const calls = [];
  const bundle = createV4BackendBundle({
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

  assert.deepEqual(Object.keys(bundle), V4_BACKEND_FUNCTION_NAMES);
  assert.deepEqual(
    V4_BACKEND_FUNCTION_NAMES,
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
