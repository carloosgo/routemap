// test-contract: architecture
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const root = new URL('../', import.meta.url);
const read = (path) => readFile(new URL(path, root), 'utf8');

test('same-country runs use one itinerary-level rail behind centered masked nodes', async () => {
  const dividers = await read('src/modules/trips/ItinerarySegmentDividers.css');
  const compact = await read('src/modules/trips/ItineraryCompactTen.css');
  const rail = await read('src/modules/trips/CountryRunRail.jsx');
  const form = await read('src/modules/trips/SegmentForm.jsx');

  assert.match(
    dividers,
    /\.segments:not\(\.segments--compact\)\s*\{[^}]*--country-run-track-w:\s*30px;[^}]*--country-run-dot-size:\s*10px;[^}]*--country-run-track-color:\s*#667085;[^}]*--country-run-dash-length:\s*3px;[^}]*--country-run-dash-period:\s*7px;[^}]*--country-run-mask-gap:\s*4px;[^}]*--country-run-surface:\s*var\(--bg, #fafbfc\);/s
  );
  assert.match(dividers, /\.segments:not\(\.segments--compact\)::before\s*\{[^}]*content:\s*none;/s);
  assert.match(
    dividers,
    /\.itinerary-segment\.is-country-run-joined::before\s*\{[^}]*content:\s*none;/s
  );
  assert.match(
    dividers,
    /\.itinerary-country-run-rail\s*\{[^}]*position:\s*absolute;[^}]*z-index:\s*0;[^}]*top:\s*var\(--country-run-top\);[^}]*inset-inline-start:\s*var\(--country-run-axis-inline\);[^}]*width:\s*var\(--country-run-rail-w\);[^}]*height:\s*var\(--country-run-height\);[^}]*transform:\s*translateX\(-50%\);[^}]*background-image:\s*linear-gradient\([\s\S]*to bottom,[\s\S]*var\(--country-run-track-color\) 0 var\(--country-run-dash-length\),[\s\S]*transparent var\(--country-run-dash-length\) var\(--country-run-dash-period\)[^}]*background-size:\s*100% var\(--country-run-dash-period\);[^}]*background-repeat:\s*repeat-y;/s
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
  assert.match(
    compact,
    /grid-template-columns:[\s\S]*var\(--country-run-drag-w, 14px\)[\s\S]*var\(--country-run-sequence-w, 19px\)[\s\S]*var\(--country-run-track-w, 30px\)[\s\S]*126px[\s\S]*minmax\(0, 1fr\);/s
  );
  assert.match(
    compact,
    /\.segments:not\(\.segments--compact\) \.itinerary-origin\s*\{[^}]*padding-left:\s*calc\([\s\S]*var\(--country-run-drag-w, 14px\)[\s\S]*var\(--country-run-sequence-w, 19px\)[\s\S]*grid-template-columns:\s*var\(--country-run-track-w, 30px\) 126px minmax\(0, 1fr\);/s
  );
  assert.doesNotMatch(dividers, /\.itinerary-stop__marker\.is-country-run-marker::(?:before|after)/);
  assert.doesNotMatch(dividers, /\.itinerary-segment\.is-country-run-joined::after\s*\{/);

  assert.match(rail, /import \{ createPortal \} from 'react-dom';/);
  assert.match(rail, /export function CountryRunRail\(/);
  assert.match(rail, /createPortal\([\s\S]*className="itinerary-country-run-rail"[\s\S]*aria-hidden="true"[\s\S]*railState\.container/s);
  assert.match(rail, /startBounds\.top \+ \(startBounds\.height \/ 2\)/);
  assert.match(rail, /endBounds\.top \+ \(endBounds\.height \/ 2\)/);
  assert.match(form, /import \{ CountryRunRail \} from '\.\/CountryRunRail\.jsx';/);
  assert.match(form, /countryRunPosition === 'start'/);
  assert.match(form, /startsAtOrigin/);
  assert.match(form, /import '\.\/ItinerarySegmentDividers\.css';/);
  assert.match(form, /is-country-run-joined/);
  assert.match(form, /is-country-run-joined-from-origin/);
});
