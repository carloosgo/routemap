// test-contract: architecture
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const root = new URL('../', import.meta.url);
const read = (path) => readFile(new URL(path, root), 'utf8');

test('origin and destination city identities keep the requested compact typography', async () => {
  const compactList = await read('src/modules/trips/ItineraryCompactList.css');

  assert.match(
    compactList,
    /autocomplete--timeline-selected:not\(\.is-open\) \.autocomplete__selected-value\s*\{[\s\S]*font-size:\s*14px\s*!important;[\s\S]*font-weight:\s*700\s*!important;[\s\S]*-webkit-line-clamp:\s*2\s*!important;/s
  );
});

test('city autocomplete advances focus only inside the current itinerary after a selection', async () => {
  const autocomplete = await read('src/components/CityAutocomplete.jsx');
  const origin = await read('src/modules/trips/ItineraryOrigin.jsx');
  const header = await read('src/modules/trips/SegmentHeader.jsx');

  assert.match(autocomplete, /focusNextOnSelect = false/);
  assert.match(autocomplete, /currentInput\?\.closest\('\.segments'\)/);
  assert.match(autocomplete, /itinerary\.querySelectorAll\('\.autocomplete \.input'\)/);
  assert.match(autocomplete, /cityInputs\.slice\(currentIndex \+ 1\)\.find/);
  assert.match(autocomplete, /nextInput\.focus\(\)/);
  assert.match(origin, /selectedDisplay="timeline"[\s\S]*focusNextOnSelect/);
  assert.match(header, /selectedDisplay="timeline"[\s\S]*focusNextOnSelect/);
});

test('compact list keeps all three row actions permanently visible without changing their handlers', async () => {
  const header = await read('src/modules/trips/SegmentHeader.jsx');
  const origin = await read('src/modules/trips/ItineraryOrigin.jsx');
  const compactList = await read('src/modules/trips/ItineraryCompactList.css');

  assert.match(header, /segment__note-btn/);
  assert.match(header, /segment__details-btn itinerary-stop__details-btn/);
  assert.match(header, /itinerary-stop__remove-btn/);
  assert.match(origin, /segment__note-btn itinerary-origin__note-btn/);
  assert.match(origin, /segment__details-btn itinerary-origin__details-btn/);
  assert.match(origin, /itinerary-stop__remove-btn itinerary-origin__clear/);
  assert.match(
    compactList,
    /\.itinerary-card__actions\s*\{[\s\S]*opacity:\s*1\s*!important;[\s\S]*visibility:\s*visible\s*!important;[\s\S]*pointer-events:\s*auto\s*!important;/s
  );
});

test('concepts action uses the requested receipt icon while retaining the existing details callback contract', async () => {
  const origin = await read('src/modules/trips/ItineraryOrigin.jsx');
  const header = await read('src/modules/trips/SegmentHeader.jsx');

  assert.match(origin, /onClick=\{onOpenDetails\}[\s\S]*<IconReceipt size=\{15\}/s);
  assert.match(header, /onClick=\{onOpenDetails\}[\s\S]*<IconReceipt size=\{15\}/s);
  assert.doesNotMatch(origin, /IconChevronDown className="itinerary-details-chevron"/);
  assert.doesNotMatch(header, /IconChevronDown className="itinerary-details-chevron"/);
});
