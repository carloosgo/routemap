// test-contract: architecture
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const root = new URL('../', import.meta.url);
const read = (path) => readFile(new URL(path, root), 'utf8');

test('origin and destination keep the timeline autocomplete contract inside compact rows', async () => {
  const header = await read('src/modules/trips/SegmentHeader.jsx');
  const origin = await read('src/modules/trips/ItineraryOrigin.jsx');
  const autocomplete = await read('src/components/CityAutocomplete.jsx');
  const compactCss = await read('src/modules/trips/ItineraryCompactList.css');

  assert.match(header, /selectedDisplay="timeline"/);
  assert.match(origin, /selectedDisplay="timeline"/);
  assert.match(autocomplete, /autocomplete--timeline-selected/);
  assert.match(autocomplete, /autocomplete__selected-value/);
  assert.match(autocomplete, /title=\{value\?\.name\}/);
  assert.match(
    compactCss,
    /autocomplete--timeline-selected:not\(\.is-open\) \.autocomplete__selected-value[\s\S]*display:\s*-webkit-box\s*!important;[\s\S]*-webkit-line-clamp:\s*2\s*!important;/s
  );
  assert.doesNotMatch(header, /itinerary-stop__country(?:["'\s])/);
  assert.doesNotMatch(origin, /itinerary-origin__country/);
});

test('compact city rows keep small flags and reuse the existing Google photo provider with an icon fallback', async () => {
  const flags = await read('src/modules/flags/flags.js');
  const autocomplete = await read('src/components/CityAutocomplete.jsx');
  const visual = await read('src/modules/trips/ItineraryCityVisual.jsx');
  const compactCss = await read('src/modules/trips/ItineraryCompactList.css');

  assert.match(flags, /FLAG_WIDTHS = new Set\(\[20, 40, 80\]\)/);
  assert.match(flags, /flagcdn\.com\/w\$\{safeWidth\}\/\$\{code\}\.png/);
  assert.match(autocomplete, /flagImageUrl\(value\.countryCode, 40\)/);
  assert.match(autocomplete, /width=\{20\}[\s\S]*height=\{14\}/);
  assert.match(compactCss, /\.itinerary-card__place \.autocomplete__field > \.flag\s*\{[\s\S]*width:\s*20px\s*!important;[\s\S]*height:\s*14px\s*!important;/s);
  assert.match(visual, /searchGooglePlaces/);
  assert.match(visual, /loadGooglePlacePhoto/);
  assert.match(visual, /<VisualIcon/);
  assert.doesNotMatch(visual, /fetch\(|https?:\/\//);
});
