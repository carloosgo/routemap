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
  assert.match(css, /\.itinerary-origin__picker \.input\s*\{[\s\S]*font-size:\s*11px;[\s\S]*font-weight:\s*500;/);
});

test('timeline gives dates, nights and amount one balanced metrics zone without shrinking city below 100px', async () => {
  const header = await read('src/modules/trips/SegmentHeader.jsx');
  const css = await read('src/modules/trips/ItineraryTimeline.css');

  assert.match(header, /className="itinerary-stop__metrics"/);
  assert.match(css, /grid-template-columns:\s*18px 30px minmax\(100px, 1fr\) 190px 22px 22px 22px;/);
  assert.match(css, /\.itinerary-stop__metrics\s*\{[\s\S]*grid-template-columns:\s*50px 58px 66px;[\s\S]*column-gap:\s*8px;/);
  assert.match(css, /\.itinerary-stop__dates\s*\{[\s\S]*font-size:\s*10\.5px;/);
  assert.match(css, /\.floating-editor \.itinerary-stop__nights\.segment__pill\s*\{[\s\S]*background:\s*#eef5ff;[\s\S]*color:\s*#3977ca;/);
  assert.match(css, /\.itinerary-stop__amount\.segment__pill\s*\{[\s\S]*width:\s*66px;/);
});

test('timeline flags use a high-density source with one fixed rounded thumbnail', async () => {
  const flags = await read('src/modules/flags/flags.js');
  const header = await read('src/modules/trips/SegmentHeader.jsx');
  const origin = await read('src/modules/trips/ItineraryOrigin.jsx');
  const css = await read('src/modules/trips/ItineraryTimeline.css');

  assert.match(flags, /FLAG_WIDTHS = new Set\(\[20, 40, 80\]\)/);
  assert.match(flags, /flagcdn\.com\/w\$\{safeWidth\}\/\$\{code\}\.png/);
  assert.match(header, /flagImageUrl\(destination\.countryCode, 80\)/);
  assert.match(origin, /flagImageUrl\(city\.countryCode, 80\)/);
  assert.match(header, /width=\{30\}[\s\S]*height=\{20\}/);
  assert.match(origin, /width=\{30\}[\s\S]*height=\{20\}/);
  assert.match(css, /\.itinerary-origin__marker img,[\s\S]*\.itinerary-stop__marker img[\s\S]*width:\s*30px;[\s\S]*height:\s*20px;[\s\S]*object-fit:\s*cover;[\s\S]*border-radius:\s*3px;/);
});
