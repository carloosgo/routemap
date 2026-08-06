import test from 'node:test';
import assert from 'node:assert/strict';

import { createExpenses } from '../src/modules/expenses/expenseModel.js';
import {
  appendExpenseItem,
  patchExpenses,
  patchFood,
  patchTransport,
  removeExpenseItem,
  updateExpenseItem,
  usesDetailedFood,
} from '../src/modules/expenses/expenseEditorOperations.js';

test('parches de gastos conservan categorías no relacionadas', () => {
  const expenses = createExpenses();
  const lodging = patchExpenses(expenses, { lodging: 75 });
  const food = patchFood(lodging, { mode: 'detailed', breakfast: 10 });
  const transport = patchTransport(food, 'train', 120);

  assert.equal(lodging.lodging, 75);
  assert.equal(food.food.mode, 'detailed');
  assert.equal(food.food.breakfast, 10);
  assert.equal(transport.transport.train, 120);
  assert.equal(transport.lodging, 75);
  assert.equal(transport.food.breakfast, 10);
  assert.equal(expenses.lodging, 0);
});

test('partidas dinámicas se agregan, sanean, actualizan y eliminan', () => {
  const expenses = createExpenses();
  const added = appendExpenseItem(expenses, 'attractions');
  const id = added.attractions[0].id;
  const labeled = updateExpenseItem(
    added,
    'attractions',
    id,
    'label',
    'Museo\u0000 central'
  );
  const priced = updateExpenseItem(labeled, 'attractions', id, 'amount', 25.5);
  const removed = removeExpenseItem(priced, 'attractions', id);

  assert.equal(added.attractions.length, 1);
  assert.equal(labeled.attractions[0].label, 'Museo central');
  assert.equal(priced.attractions[0].amount, 25.5);
  assert.equal(removed.attractions.length, 0);
  assert.equal(expenses.attractions.length, 0);
});

test('modo detallado depende únicamente del modo de comida', () => {
  const expenses = createExpenses();
  assert.equal(usesDetailedFood(expenses), false);
  assert.equal(usesDetailedFood(patchFood(expenses, { mode: 'detailed' })), true);
  assert.equal(usesDetailedFood(null), false);
});
