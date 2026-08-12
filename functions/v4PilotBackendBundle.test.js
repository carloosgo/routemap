import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import {
  V4_PILOT_BACKEND_FUNCTION_NAMES,
  createV4PilotBackendBundle,
} from './v4PilotBackendBundle.js';

test('bundle pilot compone aggregates, touches, lifecycle y purge', () => {
  const calls = [];
  const bundle = createV4PilotBackendBundle({
    adminDb: { fake: true },
    region: 'us-central1',
    aggregateFactory({ db, region }) {
      calls.push(['aggregate', db, region]);
      return {
        v4SegmentAggregate: { name: 'segment' },
        v4PlaceAggregate: { name: 'place' },
      };
    },
    touchFactory({ db, region }) {
      calls.push(['touch', db, region]);
      return {
        v4ConnectionTouch: { name: 'connection-touch' },
        v4NoteTouch: { name: 'note-touch' },
        v4ChecklistTouch: { name: 'checklist-touch' },
      };
    },
    lifecycleFactory({ adminDb }) {
      calls.push(['lifecycle', adminDb]);
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
    [
      'v4SegmentAggregate',
      'v4PlaceAggregate',
      'v4ConnectionTouch',
      'v4NoteTouch',
      'v4ChecklistTouch',
      'v4TripLifecycle',
      'v4TripPurge',
    ]
  );
  assert.deepEqual(calls.map(([kind]) => kind), ['aggregate', 'touch', 'lifecycle', 'purge']);
  assert.equal(Object.isFrozen(bundle), true);
});

test('bundle pilot sigue fuera de functions/index.js hasta autorización explícita', async () => {
  const indexSource = await readFile(new URL('./index.js', import.meta.url), 'utf8');
  assert.doesNotMatch(indexSource, /v4PilotBackendBundle/);
  assert.doesNotMatch(indexSource, /v4TripLifecycleFunction/);
  assert.doesNotMatch(indexSource, /v4AggregateTriggers/);
  assert.doesNotMatch(indexSource, /v4TripTouchTriggers/);
  assert.doesNotMatch(indexSource, /v4TripPurgeScheduler/);
});
