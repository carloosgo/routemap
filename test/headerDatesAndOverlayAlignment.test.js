// test-contract: architecture
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const root = new URL('../', import.meta.url);
const read = (path) => readFile(new URL(path, root), 'utf8');

test('note and detail overlays share the itinerary card top while the filled-note dot stays small', async () => {
  const floating = await read('src/app/FloatingItineraryPanel.css');
  const compact = await read('src/modules/trips/ItineraryCompactTen.css');

  assert.match(floating, /--floating-panel-card-top:\s*max\(/);
  assert.match(floating, /calc\(var\(--trip-header-height\) \+ var\(--floating-panel-top-gap\)\)/);
  assert.match(floating, /calc\(\(100% \+ var\(--trip-header-height\) - var\(--floating-panel-height\)\) \/ 2\)/);
  assert.match(
    floating,
    /\.workspace__desktop--column > \.mappane \.segnote\s*\{[^}]*top:\s*var\(--floating-panel-card-top\)\s*!important;/s
  );
  assert.match(
    compact,
    /\.segment__note-btn\.has-note::after\s*\{[^}]*top:\s*5px;[^}]*right:\s*5px;[^}]*width:\s*4px;[^}]*height:\s*4px;[^}]*border-width:\s*1px;/s
  );
});

test('trip dates replace distance and are the first header metric after Notes', async () => {
  const header = await read('src/app/TripSummaryHeader.jsx');
  const polish = await read('src/app/HeaderRequestedPolish.css');
  const es = await read('src/i18n/es.js');
  const en = await read('src/i18n/en.js');

  const datesIndex = header.indexOf("label={t('tripDates')}");
  const totalIndex = header.indexOf("label={t('grandTotal')}");

  assert.ok(datesIndex >= 0, 'Trip dates metric is missing');
  assert.ok(totalIndex >= 0, 'Trip total metric is missing');
  assert.ok(datesIndex < totalIndex, 'Trip dates must appear before total as the first metric after Notes');
  assert.match(header, /Icon=\{IconCalendar\}/);
  assert.match(header, /summary\.startDate && summary\.endDate/);
  assert.match(header, /formatHeaderDate\(summary\.startDate, intlLocale\)/);
  assert.match(header, /formatHeaderDate\(summary\.endDate, intlLocale\)/);
  assert.doesNotMatch(header, /DistanceSpanIcon|summary\.distanceKm|totalDistance|\bkm\b/);
  assert.match(polish, /grid-template-columns:\s*1\.45fr 1\.2fr 1fr 1fr 0\.88fr 0\.88fr;/);
  assert.match(es, /tripDates:\s*'Fechas del viaje'/);
  assert.match(en, /tripDates:\s*'Trip dates'/);
});
