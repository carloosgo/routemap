// test-contract: architecture
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const root = new URL('../', import.meta.url);
const read = (path) => readFile(new URL(path, root), 'utf8');

test('secondary date and header text uses the requested #0d6078 token', async () => {
  const [itinerary, header, calendar] = await Promise.all([
    read('src/modules/trips/ItineraryCompactTen.css'),
    read('src/app/TripSummaryHeader.css'),
    read('src/components/CalendarDateInput.css'),
  ]);

  assert.match(
    itinerary,
    /\.itinerary-stop__date-range\s*\{[^}]*color:\s*#0d6078;/s
  );
  assert.match(
    header,
    /\.trip-summary__metric-label\s*\{[^}]*color:\s*#0d6078;/s
  );
  assert.match(
    calendar,
    /\.calendar-date__placeholder\s*\{[^}]*color:\s*#0d6078;/s
  );
});
