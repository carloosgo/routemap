// test-contract: architecture
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const root = new URL('../', import.meta.url);
const read = (path) => readFile(new URL(path, root), 'utf8');

test('origin and destination keep the timeline autocomplete contract inside cards', async () => {
  const header = await read('src/modules/trips/SegmentHeader.jsx');
  const origin = await read('src/modules/trips/ItineraryOrigin.jsx');
  const autocomplete = await read('src/components/CityAutocomplete.jsx');
  const cardCss = await read('src/modules/trips/ItineraryCardLayoutFix.css');

  assert.match(header, /selectedDisplay="timeline"/);
  assert.match(origin, /selectedDisplay="timeline"/);
  assert.match(autocomplete, /autocomplete--timeline-selected/);
  assert.match(autocomplete, /autocomplete__selected-value/);
  assert.match(autocomplete, /title=\{value\?\.name\}/);
  assert.match(cardCss, /\.itinerary-card__place \.autocomplete__selected-value\s*\{[\s\S]*display:\s*none\s*!important;/s);
  assert.doesNotMatch(header, /itinerary-stop__country(?:["'\s])/);
  assert.doesNotMatch(origin, /itinerary-origin__country/);
});

test('card city fields keep compact flags while the card visual remains provider-free', async () => {
  const flags = await read('src/modules/flags/flags.js');
  const autocomplete = await read('src/components/CityAutocomplete.jsx');
  const visual = await read('src/modules/trips/ItineraryCityVisual.jsx');
  const cardCss = await read('src/modules/trips/ItineraryCardLayoutFix.css');

  assert.match(flags, /FLAG_WIDTHS = new Set\(\[20, 40, 80\]\)/);
  assert.match(flags, /flagcdn\.com\/w\$\{safeWidth\}\/\$\{code\}\.png/);
  assert.match(autocomplete, /flagImageUrl\(value\.countryCode, 40\)/);
  assert.match(autocomplete, /width=\{20\}[\s\S]*height=\{14\}/);
  assert.match(cardCss, /\.itinerary-card__place \.autocomplete__field > \.flag,[\s\S]*width:\s*20px\s*!important;[\s\S]*height:\s*14px\s*!important;/s);
  assert.doesNotMatch(visual, /https?:\/\/|flagcdn|google.*photo|street.?view/i);
});
