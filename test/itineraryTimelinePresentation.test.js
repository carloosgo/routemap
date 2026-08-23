import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const root = new URL('../', import.meta.url);
const read = (path) => readFile(new URL(path, root), 'utf8');

test('origin y destination soportan presentación seleccionada de dos líneas', async () => {
  const header = await read('src/modules/trips/SegmentHeader.jsx');
  const origin = await read('src/modules/trips/ItineraryOrigin.jsx');
  const autocomplete = await read('src/components/CityAutocomplete.jsx');
  const css = await read('src/modules/trips/ItineraryTimeline.css');
  const originCss = await read('src/modules/trips/OriginOptions.css');

  assert.match(header, /selectedDisplay="timeline"/);
  assert.match(origin, /selectedDisplay="timeline"/);
  assert.match(autocomplete, /autocomplete--timeline-selected/);
  assert.match(autocomplete, /autocomplete__selected-value/);
  assert.match(css, /-webkit-line-clamp:\s*2;/);
  assert.match(css, /\.itinerary-stop__picker \.input\s*\{[\s\S]*font-size:\s*13px;[\s\S]*font-weight:\s*700;/);
  assert.match(originCss, /\.itinerary-origin__picker \.input\s*\{[\s\S]*font-size:\s*13px;[\s\S]*font-weight:\s*700;/);
  assert.match(originCss, /\.itinerary-origin__picker \.autocomplete__selected-value\s*\{[\s\S]*-webkit-line-clamp:\s*2;[\s\S]*font-size:\s*13px;[\s\S]*font-weight:\s*700;/);
});

test('timeline preserves city and flag geometry while compact view standardizes both pills to 56px', async () => {
  const header = await read('src/modules/trips/SegmentHeader.jsx');
  const css = await read('src/modules/trips/ItineraryTimeline.css');
  const compact = await read('src/modules/trips/ItineraryCompactTen.css');

  assert.match(header, /className="itinerary-stop__metrics"/);
  assert.match(css, /\.itinerary-stop__place\s*\{[\s\S]*max-width:\s*106px;/);
  assert.match(css, /\.itinerary-origin__marker img,[\s\S]*\.itinerary-stop__marker img[\s\S]*width:\s*30px;[\s\S]*height:\s*20px;/);
  assert.match(css, /\.itinerary-stop__dates\s*\{[\s\S]*width:\s*42px;[\s\S]*font-size:\s*11\.5px;/);
  assert.match(compact, /grid-template-columns:\s*42px 56px 56px 22px 22px 18px;/);
  assert.match(compact, /\.itinerary-stop__nights\.segment__pill,[\s\S]*\.itinerary-stop__amount\.segment__pill\s*\{[^}]*width:\s*56px\s*!important;[^}]*min-width:\s*56px\s*!important;[^}]*max-width:\s*56px\s*!important;/s);
});

test('origin mirrors itinerary controls and uses the same blue details drawer instead of inline chevrons', async () => {
  const origin = await read('src/modules/trips/ItineraryOrigin.jsx');
  const form = await read('src/modules/trips/SegmentForm.jsx');
  const compact = await read('src/modules/trips/ItineraryCompactTen.css');
  const modal = await read('src/modules/trips/ItineraryDetailsModal.jsx');

  assert.match(form, /import '\.\/ItineraryCompactTen\.css';/);
  assert.match(origin, /itinerary-stop__metrics itinerary-origin__metrics/);
  assert.match(origin, /itinerary-stop__nights/);
  assert.match(origin, /itinerary-stop__amount/);
  assert.match(origin, /segment__note-btn itinerary-origin__note-btn/);
  assert.match(origin, /itinerary-origin__clear/);
  assert.match(origin, /segment__details-btn itinerary-origin__details-btn/);
  assert.match(origin, /IconChevronRight/);
  assert.doesNotMatch(origin, /IconChevronUp|IconChevronDown|aria-expanded|itinerary-origin__toggle/);
  assert.match(compact, /\.segment__details-btn\s*\{[^}]*height:\s*48px;[^}]*background:\s*var\(--atlas-accent\);/s);
  assert.match(modal, /<OriginBody/);
  assert.match(modal, /<SegmentBody/);
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
