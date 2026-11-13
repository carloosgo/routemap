import test from 'node:test';
import assert from 'node:assert/strict';
import { shiftForIndex, targetIndexFor } from './mobileCityListModel.js';

test('targetIndexFor rounds by slot and clamps to the list', () => {
  assert.equal(targetIndexFor(1, 0, 90, 4), 1);
  assert.equal(targetIndexFor(1, 50, 90, 4), 2);
  assert.equal(targetIndexFor(1, -40, 90, 4), 1);
  assert.equal(targetIndexFor(0, -500, 90, 4), 0);
  assert.equal(targetIndexFor(2, 900, 90, 4), 3);
  assert.equal(targetIndexFor(2, 100, 0, 4), 2);
});

test('shiftForIndex moves the cards between source and target', () => {
  // Bajar la tarjeta 0 a la posición 2: las 1 y 2 suben.
  assert.equal(shiftForIndex(1, 0, 2, 90), -90);
  assert.equal(shiftForIndex(2, 0, 2, 90), -90);
  assert.equal(shiftForIndex(3, 0, 2, 90), 0);
  // Subir la tarjeta 3 a la posición 1: las 1 y 2 bajan.
  assert.equal(shiftForIndex(1, 3, 1, 90), 90);
  assert.equal(shiftForIndex(2, 3, 1, 90), 90);
  assert.equal(shiftForIndex(0, 3, 1, 90), 0);
  assert.equal(shiftForIndex(3, 3, 1, 90), 0);
});
