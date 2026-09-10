import test from 'node:test';
import assert from 'node:assert/strict';
import { createV4AggregateTriggers } from '../functions/v4AggregateTriggers.js';

test('aggregate triggers exigen región explícita y cubren solo segments + places', () => {
  const calls = [];
  const handlers = [];
  const db = { marker: true };
  const result = createV4AggregateTriggers({
    db,
    region: 'europe-west1',
    triggerFactory: (options, handler) => {
      calls.push({ options, handler });
      return { path: options.document };
    },
    handlerFactory: (input) => {
      handlers.push(input);
      return async () => input.entityType;
    },
  });

  assert.deepEqual(Object.keys(result).sort(), ['v4PlaceAggregate', 'v4SegmentAggregate']);
  assert.equal(calls.length, 2);
  assert.deepEqual(handlers, [
    { db, entityType: 'segment' },
    { db, entityType: 'place' },
  ]);
  assert.equal(calls[0].options.document, 'users/{userId}/trips/{tripId}/segments/{entityId}');
  assert.equal(calls[1].options.document, 'users/{userId}/trips/{tripId}/places/{entityId}');
  for (const { options } of calls) {
    assert.equal(options.region, 'europe-west1');
    assert.equal(options.retry, true);
    assert.equal(options.timeoutSeconds, 60);
    assert.equal(options.maxInstances, 10);
    assert.equal(options.concurrency, 20);
  }
});

test('aggregate trigger factory falla cerrado sin región o dependencias válidas', () => {
  assert.throws(
    () => createV4AggregateTriggers({ db: {}, region: ' ' }),
    /region es obligatorio/
  );
  assert.throws(
    () => createV4AggregateTriggers({ db: {}, region: 'us-east1', triggerFactory: null }),
    /triggerFactory debe ser función/
  );
  assert.throws(
    () => createV4AggregateTriggers({ db: {}, region: 'us-east1', handlerFactory: null }),
    /handlerFactory debe ser función/
  );
});
