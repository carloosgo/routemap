import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const root = new URL('../', import.meta.url);
const read = (path) => readFile(new URL(path, root), 'utf8');

test('destination city supports a two-line selected presentation without changing origin presentation', async () => {
  const header = await read('src/modules/trips/SegmentHeader.jsx');
  const origin = await read('src/modules/trips/ItineraryOrigin.jsx');
  const autocomplete = await read('src/components/CityAutocomplete.jsx');
  const css = await read('src/modules/trips/ItineraryTimeline.css');

  assert.match(header, /selectedDisplay="timeline"/);
  assert.doesNotMatch(origin, /selectedDisplay="timeline"/);
  assert.match(autocomplete, /autocomplete--timeline-selected/);
  assert.match(autocomplete, /autocomplete__selected-value/);
  assert.match(css, /-webkit-line-clamp:\s*2;/);
  assert.match(css, /\.itinerary-stop__picker \.input\s*\{[\s\S]*font-size:\s*13px;[\s\S]*font-weight:\s*700;/);
  assert.match(css, /\.itinerary-origin__picker \.input\s*\{[\s\S]*font-size:\s*11px;[\s\S]*font-weight:\s*600;/);
});

test('timeline spacing keeps city width flexible while dates and pills stay balanced', async () => {
  const css = await read('src/modules/trips/ItineraryTimeline.css');

  assert.match(css, /grid-template-columns:\s*minmax\(0, 1fr\)\s+66px\s+56px\s+64px\s+22px\s+20px\s+20px\s+20px;/);
  assert.match(css, /column-gap:\s*8px;/);
  assert.match(css, /\.itinerary-stop__dates\s*\{[\s\S]*font-size:\s*10\.5px;/);
  assert.match(css, /\.floating-editor \.itinerary-stop__nights\.segment__pill\s*\{[\s\S]*background:\s*#dcecff;[\s\S]*color:\s*#245f98;/);
  assert.match(css, /\.floating-editor \.itinerary-stop__amount\.segment__pill\s*\{[\s\S]*background:\s*#f1f1ef;[\s\S]*color:\s*#61707c;/);
});

test('timeline flags use vector source at a readable rendered size', async () => {
  const flags = await read('src/modules/flags/flags.js');
  const header = await read('src/modules/trips/SegmentHeader.jsx');
  const origin = await read('src/modules/trips/ItineraryOrigin.jsx');
  const css = await read('src/modules/trips/ItineraryTimeline.css');

  assert.match(flags, /flagcdn\.com\/\$\{code\}\.svg/);
  assert.match(header, /width=\{28\}[\s\S]*height=\{20\}/);
  assert.match(origin, /width=\{28\}[\s\S]*height=\{20\}/);
  assert.match(css, /\.itinerary-origin__marker img,[\s\S]*\.itinerary-stop__marker img[\s\S]*width:\s*28px;[\s\S]*height:\s*20px;[\s\S]*object-fit:\s*contain;/);
});
