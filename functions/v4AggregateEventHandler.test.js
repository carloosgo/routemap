import test from 'node:test';
import assert from 'node:assert/strict';
import { createV4AggregateEventHandler } from './v4AggregateEventHandler.js';

function snapshot(value, exists = true) {
  return {
    exists,
    data() { return value; },
  };
}

test('handler usa wildcards de ruta como identidad autoritativa y conserva before/after', async () => {
  const calls = [];
  const db = { marker: 'admin-db' };
  const handler = createV4AggregateEventHandler({
    db,
    entityType: 'segment',
    async applyEvent(input) {
      calls.push(input);
      return { applied: true };
    },
  });

  const result = await handler({
    params: {
      userId: 'alice',
      tripId: 'trip-1',
      entityId: 'segment-1',
    },
    data: {
      before: snapshot({ id: 'segment-1', version: 1 }),
      after: snapshot({ id: 'segment-1', version: 2 }),
    },
  });

  assert.deepEqual(result, { applied: true });
  assert.equal(calls.length, 1);
  assert.deepEqual(calls[0], {
    db,
    userId: 'alice',
    tripId: 'trip-1',
    entityId: 'segment-1',
    entityType: 'segment',
    before: { id: 'segment-1', version: 1 },
    after: { id: 'segment-1', version: 2 },
  });
});

test('delete convierte after inexistente en null', async () => {
  let received = null;
  const handler = createV4AggregateEventHandler({
    db: {},
    entityType: 'place',
    async applyEvent(input) {
      received = input;
      return input;
    },
  });

  await handler({
    params: { userId: 'alice', tripId: 'trip-1', entityId: 'place-1' },
    data: {
      before: snapshot({ id: 'place-1', version: 3, status: 'deleted' }),
      after: snapshot(null, false),
    },
  });

  assert.equal(received.after, null);
  assert.equal(received.before.id, 'place-1');
});

test('handler falla cerrado ante wildcard faltante o evento sin snapshots', async () => {
  const handler = createV4AggregateEventHandler({
    db: {},
    entityType: 'segment',
    async applyEvent() {
      throw new Error('no debe ejecutarse');
    },
  });

  await assert.rejects(
    handler({
      params: { userId: 'alice', tripId: 'trip-1' },
      data: { after: snapshot({ id: 'segment-1', version: 1 }) },
    }),
    /event\.params\.entityId/
  );

  await assert.rejects(
    handler({
      params: { userId: 'alice', tripId: 'trip-1', entityId: 'segment-1' },
      data: {},
    }),
    /no contiene before ni after/
  );
});

test('factory solo acepta entidades que participan en agregados', () => {
  assert.throws(
    () => createV4AggregateEventHandler({ db: {}, entityType: 'note' }),
    /entityType de agregado v4 inválido/
  );
});
