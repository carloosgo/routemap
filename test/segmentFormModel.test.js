import test from 'node:test';
import assert from 'node:assert/strict';
import {
  formatSegmentAmount,
  formatSegmentDates,
} from '../src/modules/trips/segmentFormModel.js';

test('formatSegmentAmount mantiene dos decimales y neutraliza montos inválidos', () => {
  assert.equal(formatSegmentAmount(12.5, 'en-US'), '12.50');
  assert.equal(formatSegmentAmount('invalid', 'en-US'), '0.00');
});

test('formatSegmentDates conserva el rango, fechas parciales y ausencia de fechas', () => {
  assert.equal(
    formatSegmentDates(
      { startDate: '2026-12-03', endDate: '2026-12-07' },
      'en-US'
    ),
    'Dec 3 – Dec 7'
  );
  assert.equal(
    formatSegmentDates({ startDate: '2026-12-03', endDate: '' }, 'en-US'),
    'Dec 3 – —'
  );
  assert.equal(formatSegmentDates({ startDate: '', endDate: '' }, 'en-US'), null);
});
