// test-contract: behavior
import test from 'node:test';
import assert from 'node:assert/strict';
import { tripSummary } from '../src/modules/trips/tripSummaryModel.js';

test('header excludes origin departure date and final city date from total nights', () => {
  const trip = {
    originDetails: { departureDate: '2026-11-30' },
    segments: [
      { startDate: '2026-12-01' },
      { startDate: '2026-12-04', endDate: '2026-12-05' },
      { startDate: '2026-12-06', endDate: '2026-12-07' },
      { startDate: '2026-12-13' },
    ],
  };

  const summary = tripSummary(trip);
  assert.equal(summary.startDate, '2026-11-30');
  assert.equal(summary.endDate, '2026-12-13');
  assert.equal(summary.nights, 12);
});
