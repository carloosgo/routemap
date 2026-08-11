import test from 'node:test';
import assert from 'node:assert/strict';
import { segmentTotal } from '../src/modules/trips/tripModel.js';
import { v4SegmentAggregateValue } from '../functions/v4SegmentAggregateValue.js';

const fixtures = [
  {
    expenses: {
      lodging: 100,
      food: { mode: 'single', single: 40, breakfast: 0, lunch: 0, dinner: 0 },
      transport: { plane: 20, train: 30, bus: 10, taxiUber: 5 },
      transportOthers: [{ id: 'ferry', label: 'Ferry', amount: 15 }],
      attractions: [{ id: 'museum', label: 'Museo', amount: 25 }],
      others: [{ id: 'other', label: 'Otro', amount: 7 }],
    },
  },
  {
    expenses: {
      lodging: 250.5,
      food: { mode: 'detailed', single: 999, breakfast: 10, lunch: 20, dinner: 30 },
      transport: { plane: 0, train: 90.25, bus: 0, taxiUber: 17.5 },
      transportOthers: [],
      attractions: [],
      others: [],
    },
  },
  {
    expenses: {
      lodging: -10,
      food: { mode: 'single', single: '12.5', breakfast: 0, lunch: 0, dinner: 0 },
      transport: { plane: NaN, train: 1, bus: 2, taxiUber: 3 },
      transportOthers: [{ amount: '4.5' }],
      attractions: [{ amount: -8 }],
      others: [{ amount: 6 }],
    },
  },
];

test('agregador de servidor coincide con segmentTotal del dominio', () => {
  for (const segment of fixtures) {
    assert.equal(v4SegmentAggregateValue(segment), segmentTotal(segment));
  }
});
