import test from 'node:test';
import assert from 'node:assert/strict';
import {
  createExpenses,
  createLineItem,
  expensesTotal,
  foodTotal,
  lineItemsTotal,
  normalizeExpenses,
  transportTotal,
  tripBreakdown,
} from '../src/modules/expenses/expenseModel.js';

test('createExpenses devuelve una estructura independiente y completa', () => {
  const first = createExpenses();
  const second = createExpenses();

  assert.notEqual(first, second);
  assert.deepEqual(first.transport, { plane: 0, train: 0, bus: 0, taxiUber: 0 });
  assert.deepEqual(first.transportOthers, []);
});

test('createLineItem sanea etiqueta y monto', () => {
  const item = createLineItem('Vuelo\u0000 nocturno', '-12');
  assert.equal(item.label, 'Vuelo nocturno');
  assert.equal(item.amount, 0);
  assert.equal(typeof item.id, 'string');
});

test('los totales neutralizan datos inválidos', () => {
  assert.equal(foodTotal({ mode: 'detailed', breakfast: 10, lunch: '20.5', dinner: -4 }), 30.5);
  assert.equal(lineItemsTotal([{ amount: 4 }, null, { amount: '6' }]), 10);
  assert.equal(transportTotal({ plane: 10, train: 20 }, [{ amount: 5 }]), 35);
  assert.equal(
    expensesTotal({
      lodging: 100,
      food: { mode: 'single', single: 30 },
      transport: { plane: 50 },
      transportOthers: [{ amount: 5 }],
      attractions: [{ amount: 20 }],
      others: [{ amount: 10 }],
    }),
    215
  );
});

test('normalizeExpenses migra transporte antiguo y normaliza comida', () => {
  const normalized = normalizeExpenses({
    lodging: '75.5',
    food: {
      mode: 'unexpected',
      single: '15',
      breakfast: -1,
      lunch: '8.5',
      dinner: 'invalid',
    },
    transport: {
      plane: '100',
      taxi: 10,
      uber: '20',
      taxiUber: 5,
      ferry: 12,
      boat: 8,
    },
    attractions: [{ label: 'Museo\u0007', amount: '25' }],
  });

  assert.equal(normalized.lodging, 75.5);
  assert.deepEqual(normalized.food, {
    mode: 'single',
    single: 15,
    breakfast: 0,
    lunch: 8.5,
    dinner: 0,
  });
  assert.equal(normalized.transport.plane, 100);
  assert.equal(normalized.transport.taxiUber, 35);
  assert.deepEqual(
    normalized.transportOthers.map(({ label, amount }) => ({ label, amount })),
    [
      { label: 'Ferry', amount: 12 },
      { label: 'Barco', amount: 8 },
    ]
  );
  assert.equal(normalized.attractions[0].label, 'Museo');
  assert.equal(normalized.attractions[0].amount, 25);
});

test('tripBreakdown agrega categorías y tolera segmentos inválidos', () => {
  const result = tripBreakdown([
    null,
    {
      expenses: {
        lodging: 40,
        food: { mode: 'detailed', breakfast: 5, lunch: 10, dinner: 15 },
        transport: { plane: 100, train: 20, bus: 5, taxiUber: 7 },
        transportOthers: [{ amount: 3 }],
        attractions: [{ amount: 11 }],
        others: [{ amount: 9 }],
      },
    },
  ]);

  assert.deepEqual(result, {
    plane: 100,
    train: 20,
    bus: 5,
    taxiUber: 7,
    lodging: 40,
    food: 30,
    attractions: 11,
    others: 12,
  });
});
