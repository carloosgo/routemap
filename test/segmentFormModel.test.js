import test from 'node:test';
import assert from 'node:assert/strict';
import {
  formatSegmentAmount,
  formatSegmentDates,
  formatSegmentNights,
  isValidSegmentDateRange,
} from '../src/modules/trips/segmentFormModel.js';

test('isValidSegmentDateRange permite rangos parciales o iguales y rechaza inicio posterior al fin', () => {
  assert.equal(isValidSegmentDateRange('', ''), true);
  assert.equal(isValidSegmentDateRange('2026-12-03', ''), true);
  assert.equal(isValidSegmentDateRange('', '2026-12-07'), true);
  assert.equal(isValidSegmentDateRange('2026-12-03', '2026-12-03'), true);
  assert.equal(isValidSegmentDateRange('2026-12-03', '2026-12-07'), true);
  assert.equal(isValidSegmentDateRange('2026-12-08', '2026-12-07'), false);
});

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

test('formatSegmentNights calcula noches sin depender de zona horaria y respeta idioma', () => {
  const range = { startDate: '2026-12-03', endDate: '2026-12-07' };
  assert.equal(formatSegmentNights(range, 'es-MX'), '4 noches');
  assert.equal(formatSegmentNights(range, 'en-US'), '4 nights');
  assert.equal(
    formatSegmentNights({ startDate: '2026-12-03', endDate: '2026-12-04' }, 'es-MX'),
    '1 noche'
  );
  assert.equal(
    formatSegmentNights({ startDate: '2026-12-03', endDate: '' }, 'es-MX'),
    null
  );
  assert.equal(
    formatSegmentNights({ startDate: '2026-12-07', endDate: '2026-12-03' }, 'es-MX'),
    null
  );
});
