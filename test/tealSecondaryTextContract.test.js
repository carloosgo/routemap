// test-contract: architecture
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const root = new URL('../', import.meta.url);
const read = (path) => readFile(new URL(path, root), 'utf8');

test('itinerary dates and final header labels use #0d6078 while date placeholders stay muted', async () => {
  const [itinerary, header, headerTypography, calendar] = await Promise.all([
    read('src/modules/trips/ItineraryCompactTen.css'),
    read('src/app/TripSummaryHeader.css'),
    read('src/app/TripSummaryHeaderTypography.css'),
    read('src/components/CalendarDateInput.css'),
  ]);

  assert.match(
    itinerary,
    /\.itinerary-stop__date-range\s*\{[^}]*align-items:\s*flex-end;[^}]*color:\s*#0d6078;[^}]*text-align:\s*right;/s
  );
  assert.match(
    itinerary,
    /\.itinerary-stop__date-range\s*>\s*span\s*\{[^}]*width:\s*100%;[^}]*text-align:\s*right;/s
  );
  assert.match(
    header,
    /\.trip-summary__metric-label\s*\{[^}]*color:\s*#0d6078;/s
  );
  assert.match(
    headerTypography,
    /\.trip-summary__metric-label\s*\{[^}]*color:\s*#0d6078;/s
  );
  assert.match(
    calendar,
    /\.calendar-date__placeholder\s*\{[^}]*color:\s*var\(--text-mute\);/s
  );
  assert.doesNotMatch(
    calendar,
    /\.calendar-date__placeholder\s*\{[^}]*color:\s*#0d6078;/s
  );
});
