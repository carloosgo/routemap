import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const root = new URL('../', import.meta.url);
const read = (path) => readFile(new URL(path, root), 'utf8');

test('origin y destination usan ciudad seleccionada de una sola linea a 13px/600', async () => {
  const header = await read('src/modules/trips/SegmentHeader.jsx');
  const origin = await read('src/modules/trips/ItineraryOrigin.jsx');
  const autocomplete = await read('src/components/CityAutocomplete.jsx');
  const compact = await read('src/modules/trips/ItineraryCompactTen.css');

  assert.match(header, /selectedDisplay="timeline"/);
  assert.match(origin, /selectedDisplay="timeline"/);
  assert.match(autocomplete, /autocomplete--timeline-selected/);
  assert.match(autocomplete, /autocomplete__selected-value/);
  assert.match(compact, /autocomplete__selected-value[\s\S]*transform:\s*none;[\s\S]*-webkit-line-clamp:\s*1;[\s\S]*font-size:\s*13px;[\s\S]*font-weight:\s*600;/s);
  assert.doesNotMatch(header, /itinerary-stop__country/);
  assert.doesNotMatch(origin, /itinerary-origin__country/);
});

test('timeline preserves flag geometry and gives city and plain metrics enough room', async () => {
  const header = await read('src/modules/trips/SegmentHeader.jsx');
  const origin = await read('src/modules/trips/ItineraryOrigin.jsx');
  const css = await read('src/modules/trips/ItineraryTimeline.css');
  const compact = await read('src/modules/trips/ItineraryCompactTen.css');

  assert.match(header, /className="itinerary-stop__metrics"/);
  assert.match(css, /\.itinerary-origin__marker img,[\s\S]*\.itinerary-stop__marker img[\s\S]*width:\s*30px;[\s\S]*height:\s*20px;/);
  assert.doesNotMatch(header, /itinerary-stop__dates|segment__pill/);
  assert.doesNotMatch(origin, /itinerary-stop__dates|segment__pill/);
  assert.match(compact, /grid-template-columns:\s*18px 30px 126px minmax\(0, 1fr\);/);
  assert.match(compact, /grid-template-columns:\s*64px minmax\(86px, 1fr\) 22px 22px 22px;/);
  assert.match(compact, /\.itinerary-stop__nights,[\s\S]*\.itinerary-stop__amount\s*\{[^}]*font-size:\s*13px;[^}]*font-weight:\s*400;[^}]*overflow:\s*visible;/s);
});

test('origin mirrors note expand close controls while expand still opens the separate details module', async () => {
  const origin = await read('src/modules/trips/ItineraryOrigin.jsx');
  const header = await read('src/modules/trips/SegmentHeader.jsx');
  const form = await read('src/modules/trips/SegmentForm.jsx');
  const compact = await read('src/modules/trips/ItineraryCompactTen.css');
  const modal = await read('src/modules/trips/ItineraryDetailsModal.jsx');

  assert.match(form, /import '\.\/ItineraryCompactTen\.css';/);
  assert.match(origin, /itinerary-stop__metrics itinerary-origin__metrics/);
  assert.match(origin, /itinerary-stop__nights/);
  assert.match(origin, /itinerary-stop__amount/);
  assert.match(origin, /segment__note-btn itinerary-origin__note-btn/);
  assert.match(origin, /segment__toggle segment__details-btn itinerary-origin__details-btn/);
  assert.match(origin, /itinerary-origin__clear/);
  assert.match(origin, /IconChevronDown/);
  assert.match(header, /segment__toggle segment__details-btn itinerary-stop__details-btn/);
  assert.match(header, /IconChevronDown/);
  assert.doesNotMatch(origin, /IconChevronRight|IconChevronUp|aria-expanded|aria-controls/);
  assert.doesNotMatch(compact, /height:\s*48px;[^}]*background:\s*var\(--atlas-accent\)/s);
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
