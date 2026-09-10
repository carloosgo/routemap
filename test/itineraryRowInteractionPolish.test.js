// test-contract: architecture
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const root = new URL('../', import.meta.url);
const read = (path) => readFile(new URL(path, root), 'utf8');

test('origin and middle same-country cities share the same compact typography', async () => {
  const compact = await read('src/modules/trips/ItineraryCompactTen.css');

  assert.match(
    compact,
    /\.itinerary-origin__picker \.autocomplete__selected-value,[\s\S]*\.itinerary-segment\.is-country-run-middle \.itinerary-stop__picker \.autocomplete__selected-value\s*\{[^}]*font-size:\s*13px;[^}]*font-weight:\s*400;/s
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

test('remove control is hover-revealed on desktop without collapsing its layout slot', async () => {
  const header = await read('src/modules/trips/SegmentHeader.jsx');
  const compact = await read('src/modules/trips/ItineraryCompactTen.css');

  assert.match(header, /className="btn btn--icon itinerary-stop__remove-btn"/);
  assert.match(
    compact,
    /@media \(min-width: 721px\) and \(hover: hover\) and \(pointer: fine\)[\s\S]*\.itinerary-stop__remove-btn\s*\{[^}]*opacity:\s*0;[^}]*pointer-events:\s*none;/s
  );
  assert.match(
    compact,
    /\.segment__header\.itinerary-stop:hover \.itinerary-stop__remove-btn,[\s\S]*\.itinerary-stop__remove-btn:focus-visible\s*\{[^}]*opacity:\s*1;[^}]*pointer-events:\s*auto;/s
  );
});

test('details chevron points toward the map while retaining the existing icon contract', async () => {
  const origin = await read('src/modules/trips/ItineraryOrigin.jsx');
  const header = await read('src/modules/trips/SegmentHeader.jsx');
  const compact = await read('src/modules/trips/ItineraryCompactTen.css');

  assert.match(origin, /IconChevronDown className="itinerary-details-chevron"/);
  assert.match(header, /IconChevronDown className="itinerary-details-chevron"/);
  assert.match(compact, /\.itinerary-details-chevron\s*\{[^}]*transform:\s*rotate\(-90deg\);/s);
});
