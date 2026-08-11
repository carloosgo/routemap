import test from 'node:test';
import assert from 'node:assert/strict';
import {
  aggregateDeltaFromContribution,
  targetAggregateContribution,
} from '../functions/v4AggregateContributionModel.js';

const segment = (version, amount, status = 'active') => ({ version, amount, status });
const amountOf = (entity) => entity.amount;

test('primera contribución activa incrementa conteo y total', () => {
  const target = targetAggregateContribution({
    entityType: 'segment',
    after: segment(1, 100),
    valueOf: amountOf,
  });
  assert.deepEqual(aggregateDeltaFromContribution(null, target), {
    apply: true,
    countDelta: 1,
    valueDelta: 100,
  });
});

test('un evento nuevo puede saltar versiones entregadas fuera de orden', () => {
  const current = {
    entityType: 'segment',
    version: 1,
    countContribution: 1,
    valueContribution: 100,
  };
  const version3 = targetAggregateContribution({
    entityType: 'segment',
    before: segment(2, 120),
    after: segment(3, 140),
    valueOf: amountOf,
  });
  assert.deepEqual(aggregateDeltaFromContribution(current, version3), {
    apply: true,
    countDelta: 0,
    valueDelta: 40,
  });

  const appliedVersion3 = { ...version3 };
  const lateVersion2 = targetAggregateContribution({
    entityType: 'segment',
    before: segment(1, 100),
    after: segment(2, 120),
    valueOf: amountOf,
  });
  assert.deepEqual(aggregateDeltaFromContribution(appliedVersion3, lateVersion2), {
    apply: false,
    countDelta: 0,
    valueDelta: 0,
  });
});

test('entrega duplicada de la misma versión es no-op', () => {
  const target = targetAggregateContribution({
    entityType: 'segment',
    after: segment(3, 140),
    valueOf: amountOf,
  });
  assert.equal(aggregateDeltaFromContribution({ ...target }, target).apply, false);
});

test('delete descuenta una vez y purga posterior no vuelve a descontar', () => {
  const current = {
    entityType: 'segment',
    version: 3,
    countContribution: 1,
    valueContribution: 140,
  };
  const tombstone = segment(4, 140, 'deleted');
  const deleteTarget = targetAggregateContribution({
    entityType: 'segment',
    before: segment(3, 140),
    after: tombstone,
    valueOf: amountOf,
  });
  assert.deepEqual(aggregateDeltaFromContribution(current, deleteTarget), {
    apply: true,
    countDelta: -1,
    valueDelta: -140,
  });

  const purgeTarget = targetAggregateContribution({
    entityType: 'segment',
    before: tombstone,
    after: null,
    valueOf: amountOf,
  });
  assert.equal(aggregateDeltaFromContribution({ ...deleteTarget }, purgeTarget).apply, false);
});

test('si purga llega antes que delete también converge a cero', () => {
  const current = {
    entityType: 'segment',
    version: 3,
    countContribution: 1,
    valueContribution: 140,
  };
  const tombstone = segment(4, 140, 'deleted');
  const purgeTarget = targetAggregateContribution({
    entityType: 'segment',
    before: tombstone,
    after: null,
    valueOf: amountOf,
  });
  assert.deepEqual(aggregateDeltaFromContribution(current, purgeTarget), {
    apply: true,
    countDelta: -1,
    valueDelta: -140,
  });
});

test('restore vuelve a aportar y places nunca alteran total monetario', () => {
  const restored = targetAggregateContribution({
    entityType: 'segment',
    before: segment(4, 140, 'deleted'),
    after: segment(5, 150),
    valueOf: amountOf,
  });
  assert.deepEqual(aggregateDeltaFromContribution({
    version: 4,
    countContribution: 0,
    valueContribution: 0,
  }, restored), {
    apply: true,
    countDelta: 1,
    valueDelta: 150,
  });

  const placeTarget = targetAggregateContribution({
    entityType: 'place',
    after: { version: 1, status: 'active' },
  });
  assert.equal(placeTarget.valueContribution, 0);
});
