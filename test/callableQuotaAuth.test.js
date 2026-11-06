import test from 'node:test';
import assert from 'node:assert/strict';
import { enforceQuota } from '../functions/callablePolicy.js';

const QUOTA = { scope: 'test-scope', maxRequests: 2, windowMs: 60_000 };

function fakeDb() {
  const docs = new Map();
  return {
    writes: docs,
    collection: () => ({
      doc: (id) => ({ id }),
    }),
    runTransaction: async (callback) => callback({
      get: async (ref) => ({ data: () => docs.get(ref.id) }),
      set: (ref, value) => docs.set(ref.id, value),
    }),
  };
}

test('las callables con cuota rechazan llamadas sin sesión aunque cambien X-Forwarded-For', async () => {
  const db = fakeDb();
  for (const ip of ['1.1.1.1', '2.2.2.2']) {
    await assert.rejects(
      enforceQuota(db, { rawRequest: { headers: { 'x-forwarded-for': ip } } }, QUOTA),
      (error) => error.code === 'unauthenticated'
    );
  }
  assert.equal(db.writes.size, 0);
});

test('la cuota se cuenta por UID y se agota al llegar al máximo', async () => {
  const db = fakeDb();
  const request = { auth: { uid: 'user-1' }, rawRequest: { headers: {} } };
  await enforceQuota(db, request, QUOTA);
  await enforceQuota(db, request, QUOTA);
  await assert.rejects(
    enforceQuota(db, request, QUOTA),
    (error) => error.code === 'resource-exhausted'
  );
  assert.equal(db.writes.size, 1);
});
