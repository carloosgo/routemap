import test from 'node:test';
import assert from 'node:assert/strict';

import { createExpenses } from '../src/modules/expenses/expenseModel.js';
import {
  appendExpenseItem,
  patchExpenses,
  patchFood,
  patchTransport,
  removeExpenseItem,
  setExpenseItemsTotal,
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

test('el total agregado de una categoría conserva IDs y etiquetas existentes', () => {
  const expenses = createExpenses();
  const first = appendExpenseItem(expenses, 'attractions');
  const firstId = first.attractions[0].id;
  const firstNamed = updateExpenseItem(first, 'attractions', firstId, 'label', 'Museo');
  const firstPriced = updateExpenseItem(firstNamed, 'attractions', firstId, 'amount', 40);
  const second = appendExpenseItem(firstPriced, 'attractions');
  const secondId = second.attractions[1].id;
  const secondNamed = updateExpenseItem(second, 'attractions', secondId, 'label', 'Tour');
  const secondPriced = updateExpenseItem(secondNamed, 'attractions', secondId, 'amount', 20);

  const reduced = setExpenseItemsTotal(secondPriced, 'attractions', 45);
  assert.equal(reduced.attractions[0].id, firstId);
  assert.equal(reduced.attractions[0].label, 'Museo');
  assert.equal(reduced.attractions[0].amount, 40);
  assert.equal(reduced.attractions[1].id, secondId);
  assert.equal(reduced.attractions[1].label, 'Tour');
  assert.equal(reduced.attractions[1].amount, 5);

  const increased = setExpenseItemsTotal(reduced, 'attractions', 70);
  assert.equal(increased.attractions[0].amount, 40);
  assert.equal(increased.attractions[1].amount, 30);
});

test('el total agregado crea una partida compatible cuando la categoría estaba vacía', () => {
  const expenses = createExpenses();
  const next = setExpenseItemsTotal(expenses, 'attractions', 35.5);

  assert.equal(next.attractions.length, 1);
  assert.equal(next.attractions[0].label, '');
  assert.equal(next.attractions[0].amount, 35.5);
});

test('modo detallado depende únicamente del modo de comida', () => {
  const expenses = createExpenses();
  assert.equal(usesDetailedFood(expenses), false);
  assert.equal(usesDetailedFood(patchFood(expenses, { mode: 'detailed' })), true);
  assert.equal(usesDetailedFood(null), false);
});
