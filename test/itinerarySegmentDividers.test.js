// test-contract: architecture
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const root = new URL('../', import.meta.url);
const read = (path) => readFile(new URL(path, root), 'utf8');

test('same-country runs use one itinerary-level rail behind centered masked nodes', async () => {
  const dividers = await read('src/modules/trips/ItinerarySegmentDividers.css');
  const form = await read('src/modules/trips/SegmentForm.jsx');

  assert.match(
    dividers,
    /\.segments:not\(\.segments--compact\)\s*\{[^}]*--country-run-track-w:\s*30px;[^}]*--country-run-dot-size:\s*10px;[^}]*--country-run-track-color:\s*#667085;[^}]*--country-run-dash-length:\s*3px;[^}]*--country-run-dash-period:\s*7px;[^}]*--country-run-mask-gap:\s*4px;[^}]*--country-run-surface:\s*var\(--surface, #fff\);/s
  );
  assert.match(
    dividers,
    /\.segments:not\(\.segments--compact\)::before\s*\{[^}]*content:\s*none;/s
  );
  assert.match(
    dividers,
    /\.itinerary-origin-section \+ \.itinerary-segment::before,[\s\S]*\.itinerary-segment \+ \.itinerary-segment::before\s*\{[^}]*left:\s*53px;[^}]*right:\s*4px;[^}]*height:\s*1px;[^}]*background:\s*repeating-linear-gradient\([\s\S]*to right,[\s\S]*#c9ced7 0 3px,[\s\S]*transparent 3px 7px/s
  );
  assert.match(
    dividers,
    /\.itinerary-segment\.is-country-run-joined::before\s*\{[^}]*content:\s*none;/s
  );
  assert.match(
    dividers,
    /\.itinerary-country-run-rail\s*\{[^}]*position:\s*absolute;[^}]*z-index:\s*0;[^}]*top:\s*var\(--country-run-top\);[^}]*inset-inline-start:\s*var\(--country-run-axis-inline\);[^}]*width:\s*var\(--country-run-rail-w\);[^}]*height:\s*var\(--country-run-height\);[^}]*transform:\s*translateX\(-50%\);[^}]*background:\s*repeating-linear-gradient\([\s\S]*to bottom,[\s\S]*var\(--country-run-track-color\) 0 var\(--country-run-dash-length\),[\s\S]*transparent var\(--country-run-dash-length\) var\(--country-run-dash-period\)/s
  );
  assert.match(
    dividers,
    /\.itinerary-stop__marker\.is-country-run-marker\s*\{[^}]*z-index:\s*1;[^}]*width:\s*var\(--country-run-track-w\);[^}]*justify-self:\s*center;/s
  );
  assert.match(
    dividers,
    /\.itinerary-stop__country-run-dot\s*\{[^}]*z-index:\s*1;[^}]*width:\s*var\(--country-run-dot-size\);[^}]*height:\s*var\(--country-run-dot-size\);[^}]*aspect-ratio:\s*1 \/ 1;[^}]*border-radius:\s*50%;[^}]*background:\s*var\(--country-run-track-color\);[^}]*box-shadow:\s*0 0 0 var\(--country-run-mask-gap\) var\(--country-run-surface\);/s
  );
  assert.match(
    dividers,
    /\.itinerary-stop__marker\.is-country-run-marker \.itinerary-stop__marker-flag\s*\{[^}]*z-index:\s*1;[^}]*box-shadow:\s*0 0 0 var\(--country-run-mask-gap\) var\(--country-run-surface\);/s
  );
  assert.doesNotMatch(dividers, /\.itinerary-stop__marker\.is-country-run-marker::(?:before|after)/);
  assert.doesNotMatch(dividers, /\.itinerary-segment\.is-country-run-joined::after\s*\{/);
  assert.doesNotMatch(dividers, /M0 0 L4 4|fill='%2319a5d0'|clip-path/);

  assert.match(form, /import \{ createPortal \} from 'react-dom';/);
  assert.match(form, /function CountryRunRail\(/);
  assert.match(form, /createPortal\([\s\S]*className="itinerary-country-run-rail"[\s\S]*aria-hidden="true"[\s\S]*railState\.container/s);
  assert.match(form, /startBounds\.top \+ \(startBounds\.height \/ 2\)/);
  assert.match(form, /endBounds\.top \+ \(endBounds\.height \/ 2\)/);
  assert.match(form, /countryRunPosition === 'start'/);
  assert.match(form, /startsAtOrigin/);
  assert.match(form, /import '\.\/ItinerarySegmentDividers\.css';/);
  assert.match(form, /is-country-run-joined/);
  assert.match(form, /is-country-run-joined-from-origin/);
});
