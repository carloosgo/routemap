// test-contract: architecture
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const root = new URL('../', import.meta.url);
const read = (path) => readFile(new URL(path, root), 'utf8');

test('itinerary dates and final header labels use #0d6078 while date placeholders stay muted', async () => {
  const [itinerary, header, headerTypography, headerFinal, calendar] = await Promise.all([
    read('src/modules/trips/ItineraryCompactTen.css'),
    read('src/app/TripSummaryHeader.css'),
    read('src/app/TripSummaryHeaderTypography.css'),
    read('src/app/HeaderRequestedPolish.css'),
    read('src/components/CalendarDateInput.css'),
  ]);

  assert.match(
    itinerary,
    /\.itinerary-stop__date-range\s*\{[^}]*flex-direction:\s*column;[^}]*align-items:\s*flex-end;[^}]*justify-content:\s*center;[^}]*color:\s*#0d6078;[^}]*text-align:\s*right;/s
  );
  assert.match(
    itinerary,
    /\.itinerary-stop__date-range\s*>\s*span\s*\{[^}]*display:\s*block;[^}]*width:\s*100%;[^}]*text-align:\s*right;/s
  );
  assert.doesNotMatch(
    itinerary,
    /span:first-child:not\(:empty\) \+ span:not\(:empty\)::before/
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
    headerFinal,
    /\.trip-summary \.trip-summary__metric-label\s*\{[^}]*color:\s*#0d6078;/s
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
