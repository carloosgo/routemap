import test from 'node:test';
import assert from 'node:assert/strict';
import { createExpenses } from '../src/modules/expenses/expenseModel.js';
import { initialRankForPosition } from '../src/modules/storage-v4/rankModel.js';
import { planV4TripSave } from '../src/infrastructure/firebase/v4TripSavePlan.js';

function originDetails(overrides = {}) {
  return {
    departureDate: '',
    expenses: createExpenses(),
    note: '',
    ...overrides,
  };
}

function trip(overrides = {}) {
  return {
    id: 'trip-1',
    name: 'Europa',
    currency: 'EUR',
    origin: null,
    originDetails: originDetails(),
    segments: [],
    places: [],
    routeConnections: [],
    placeOrderVersion: 1,
    notes: [],
    checklist: [],
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-02T00:00:00.000Z',
    ...overrides,
  };
}

function remoteRoot(overrides = {}) {
  return {
    id: 'trip-1',
    name: 'Europa',
    currency: 'EUR',
    origin: null,
    originDetails: originDetails(),
    schemaVersion: 4,
    status: 'active',
    version: 2,
    ...overrides,
  };
}

function segment(id, note = '') {
  return {
    id,
    destination: null,
    startDate: '',
    endDate: '',
    expenses: createExpenses(),
    note,
  };
}

function remoteSegment(id, { note = '', version = 1, status = 'active', rank = initialRankForPosition(0) } = {}) {
  return {
    ...segment(id, note),
    rank,
    status,
    version,
    createdAt: {},
    updatedAt: {},
    deletedAt: status === 'deleted' ? {} : null,
  };
}

function remoteNote(id, text, { version = 1, status = 'active', rank = initialRankForPosition(0) } = {}) {
  return {
    id,
    rank,
    title: '',
    text,
    status,
    version,
    createdAt: {},
    updatedAt: {},
    deletedAt: status === 'deleted' ? {} : null,
  };
}

test('viaje nuevo se descompone en root + entidades v4 sin whole-document write', () => {
  const plan = planV4TripSave({
    uid: 'alice',
    rawTrip: trip({
      segments: [segment('segment-1', 'tren')],
      notes: [{ id: 'note-1', title: 'Hotel', text: 'Reserva' }],
      checklist: [{ id: 'check-1', text: 'Pasaporte', done: false }],
    }),
  });

  assert.equal(plan.createsRoot, true);
  assert.equal(plan.rootIntent.entityType, 'trip');
  assert.equal(plan.rootIntent.serverVersion, 0);
  assert.equal(plan.rootIntent.serverStatus, 'missing');
  assert.deepEqual(plan.rootIntent.payload, {
    id: 'trip-1',
    name: 'Europa',
    currency: 'EUR',
    origin: null,
    originDetails: originDetails(),
  });
  assert.equal(plan.intents.length, 4);
  assert.deepEqual(
    plan.childIntents.map((intent) => [intent.entityType, intent.entityId, intent.serverStatus]),
    [
      ['segment', 'segment-1', 'missing'],
      ['note', 'note-1', 'missing'],
      ['checklist', 'check-1', 'missing'],
    ]
  );
  for (const intent of plan.childIntents) {
    assert.match(intent.payload.rank, /^[0-9a-z]{10}$/);
  }
});

test('viaje existente genera solo update/delete/restore necesarios y conserva versiones base', () => {
  const plan = planV4TripSave({
    uid: 'alice',
    rawTrip: trip({
      name: 'Europa 2026',
      segments: [segment('segment-keep', 'actualizado')],
      notes: [{ id: 'note-restore', title: '', text: 'texto nuevo' }],
    }),
    remoteRoot: remoteRoot({ version: 7 }),
    remoteCollections: {
      segments: [
        remoteSegment('segment-keep', { note: 'anterior', version: 3 }),
        remoteSegment('segment-remove', { note: 'quitar', version: 5, rank: initialRankForPosition(1) }),
      ],
      places: [],
      routeConnections: [],
      notes: [remoteNote('note-restore', 'texto viejo', { version: 4, status: 'deleted' })],
      checklist: [],
    },
  });

  assert.equal(plan.createsRoot, false);
  assert.equal(plan.rootIntent.serverVersion, 7);
  assert.equal(plan.rootIntent.serverStatus, 'active');
  assert.equal(plan.rootIntent.payload.name, 'Europa 2026');

  const byKey = new Map(plan.childIntents.map((intent) => [
    `${intent.entityType}:${intent.entityId}`,
    intent,
  ]));
  const updated = byKey.get('segment:segment-keep');
  const removed = byKey.get('segment:segment-remove');
  const restored = byKey.get('note:note-restore');

  assert.equal(updated.serverVersion, 3);
  assert.equal(updated.serverStatus, 'active');
  assert.equal(updated.desiredStatus, 'active');
  assert.equal(updated.payload.note, 'actualizado');

  assert.equal(removed.serverVersion, 5);
  assert.equal(removed.serverStatus, 'active');
  assert.equal(removed.desiredStatus, 'deleted');
  assert.equal(removed.payload, null);

  assert.equal(restored.serverVersion, 4);
  assert.equal(restored.serverStatus, 'deleted');
  assert.equal(restored.desiredStatus, 'active');
  assert.equal(restored.payload.text, 'texto nuevo');
});

test('originDetails participa en el root y roots antiguos vacíos no fuerzan una escritura', () => {
  const desiredOrigin = originDetails({
    departureDate: '2026-12-01',
    expenses: { ...createExpenses(), lodging: 95 },
  });
  const changed = planV4TripSave({
    uid: 'alice',
    rawTrip: trip({ originDetails: desiredOrigin }),
    remoteRoot: remoteRoot({ version: 5 }),
  });
  assert.equal(changed.rootIntent.entityType, 'trip');
  assert.equal(changed.rootIntent.serverVersion, 5);
  assert.deepEqual(changed.rootIntent.payload.originDetails, desiredOrigin);
  assert.deepEqual(changed.childIntents, []);

  const legacyRoot = remoteRoot({ version: 6 });
  delete legacyRoot.originDetails;
  const unchangedLegacy = planV4TripSave({
    uid: 'alice',
    rawTrip: trip(),
    remoteRoot: legacyRoot,
  });
  assert.equal(unchangedLegacy.rootIntent, null);

  const legacyRootWithoutNote = remoteRoot({ version: 7 });
  delete legacyRootWithoutNote.originDetails.note;
  const unchangedLegacyWithoutNote = planV4TripSave({
    uid: 'alice',
    rawTrip: trip(),
    remoteRoot: legacyRootWithoutNote,
  });
  assert.equal(unchangedLegacyWithoutNote.rootIntent, null);

  const changedLegacy = planV4TripSave({
    uid: 'alice',
    rawTrip: trip({ originDetails: desiredOrigin }),
    remoteRoot: legacyRoot,
  });
  assert.equal(changedLegacy.rootIntent.serverVersion, 6);
  assert.deepEqual(changedLegacy.rootIntent.payload.originDetails, desiredOrigin);
});

test('sin cambios remotos el planner no inventa mutaciones', () => {
  const desired = trip({
    segments: [segment('segment-1', 'igual')],
    notes: [{ id: 'note-1', title: '', text: 'igual' }],
  });
  const plan = planV4TripSave({
    uid: 'alice',
    rawTrip: desired,
    remoteRoot: remoteRoot(),
    remoteCollections: {
      segments: [remoteSegment('segment-1', { note: 'igual', version: 8 })],
      places: [],
      routeConnections: [],
      notes: [remoteNote('note-1', 'igual', { version: 3 })],
      checklist: [],
    },
  });

  assert.equal(plan.rootIntent, null);
  assert.deepEqual(plan.childIntents, []);
  assert.deepEqual(plan.intents, []);
});

test('planner falla cerrado ante root no-v4, borrado o hijos huérfanos', () => {
  assert.throws(
    () => planV4TripSave({
      uid: 'alice',
      rawTrip: trip(),
      remoteRoot: { id: 'trip-1', schemaVersion: 3, status: 'active', version: 1 },
    }),
    /no usa Storage v4/
  );
  assert.throws(
    () => planV4TripSave({
      uid: 'alice',
      rawTrip: trip(),
      remoteRoot: remoteRoot({ status: 'deleted', version: 2 }),
    }),
    /restore explícito/
  );
  assert.throws(
    () => planV4TripSave({
      uid: 'alice',
      rawTrip: trip(),
      remoteCollections: { segments: [remoteSegment('orphan')] },
    }),
    /huérfanas/
  );
});
