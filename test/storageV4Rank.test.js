import test from 'node:test';
import assert from 'node:assert/strict';
import {
  initialRankForPosition,
  rankBetween,
  rankNeedsRebalance,
  rebalanceRanks,
} from '../src/modules/storage-v4/rankModel.js';

test('ranks iniciales son lexicográficamente ordenables y estables', () => {
  const ranks = rebalanceRanks(500);
  assert.equal(ranks.length, 500);
  assert.deepEqual([...ranks].sort(), ranks);
  assert.equal(new Set(ranks).size, ranks.length);
  assert.equal(ranks[0], initialRankForPosition(0));
});

test('insertar entre vecinos produce un rank estrictamente intermedio', () => {
  const left = initialRankForPosition(4);
  const right = initialRankForPosition(5);
  const middle = rankBetween(left, right);
  assert.ok(middle > left);
  assert.ok(middle < right);
  assert.equal(rankNeedsRebalance(left, right), false);
});

test('prepend y append no obligan a reescribir toda la lista', () => {
  const first = initialRankForPosition(0);
  const before = rankBetween(null, first);
  const after = rankBetween(first, null);
  assert.ok(before < first);
  assert.ok(after > first);
});

test('inserciones repetidas detectan rebalanceo antes de agotar el espacio', () => {
  let left = initialRankForPosition(0);
  const right = initialRankForPosition(1);
  let detected = false;

  for (let index = 0; index < 30; index += 1) {
    if (rankNeedsRebalance(left, right)) {
      detected = true;
      break;
    }
    const next = rankBetween(left, right);
    assert.ok(next);
    left = next;
  }

  assert.equal(detected, true);
});

test('rankBetween rechaza orden inválido y no usa floats como contrato', () => {
  const left = initialRankForPosition(2);
  const right = initialRankForPosition(1);
  assert.equal(rankBetween(left, right), null);
  assert.throws(() => rankBetween('1.5', right), /rank v4 inválido/);
});
