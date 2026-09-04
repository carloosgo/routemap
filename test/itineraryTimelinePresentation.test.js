// test-contract: architecture
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const root = new URL('../', import.meta.url);
const read = (path) => readFile(new URL(path, root), 'utf8');

test('origin and destination use the timeline-selected city presentation', async () => {
  const header = await read('src/modules/trips/SegmentHeader.jsx');
  const origin = await read('src/modules/trips/ItineraryOrigin.jsx');
  const autocomplete = await read('src/components/CityAutocomplete.jsx');

  assert.match(header, /selectedDisplay="timeline"/);
  assert.match(origin, /selectedDisplay="timeline"/);
  assert.match(autocomplete, /autocomplete--timeline-selected/);
  assert.match(autocomplete, /autocomplete__selected-value/);
  assert.match(autocomplete, /title=\{value\?\.name\}/);
  assert.doesNotMatch(header, /itinerary-stop__country(?:["'\s])/);
  assert.doesNotMatch(origin, /itinerary-origin__country/);
});

test('selected timeline flags render smaller without shrinking their high-density source or marker track', async () => {
  const flags = await read('src/modules/flags/flags.js');
  const header = await read('src/modules/trips/SegmentHeader.jsx');
  const origin = await read('src/modules/trips/ItineraryOrigin.jsx');
  const css = await read('src/modules/trips/ItineraryTimeline.css');

  assert.match(flags, /FLAG_WIDTHS = new Set\(\[20, 40, 80\]\)/);
  assert.match(flags, /flagcdn\.com\/w\$\{safeWidth\}\/\$\{code\}\.png/);
  assert.match(header, /flagImageUrl\(destination\.countryCode, 80\)/);
  assert.match(origin, /flagImageUrl\(city\.countryCode, 80\)/);
  assert.match(header, /SELECTED_FLAG_STYLE[\s\S]*width:\s*'27px',[\s\S]*height:\s*'18px'/);
  assert.match(origin, /SELECTED_FLAG_STYLE[\s\S]*width:\s*'27px',[\s\S]*height:\s*'18px'/);
  assert.match(header, /width=\{27\}[\s\S]*height=\{18\}[\s\S]*style=\{SELECTED_FLAG_STYLE\}/);
  assert.match(origin, /width=\{27\}[\s\S]*height=\{18\}[\s\S]*style=\{SELECTED_FLAG_STYLE\}/);
  assert.match(css, /\.itinerary-origin__marker\s*\{[\s\S]*width:\s*30px;[\s\S]*height:\s*24px;/);
  assert.match(css, /\.itinerary-stop__marker\s*\{[\s\S]*width:\s*30px;[\s\S]*height:\s*24px;/);
  assert.match(css, /\.itinerary-origin__marker img,[\s\S]*\.itinerary-stop__marker img[\s\S]*object-fit:\s*cover;[\s\S]*border-radius:\s*3px;[\s\S]*image-rendering:\s*auto;/);
});
