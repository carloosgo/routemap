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
  assert.doesNotMatch(header, /itinerary-stop__country(?:["'\s])/);
  assert.doesNotMatch(origin, /itinerary-origin__country/);
});

test('timeline uses independent drag, sequence, flag and city tracks with one spacing rhythm', async () => {
  const header = await read('src/modules/trips/SegmentHeader.jsx');
  const origin = await read('src/modules/trips/ItineraryOrigin.jsx');
  const css = await read('src/modules/trips/ItineraryTimeline.css');
  const compact = await read('src/modules/trips/ItineraryCompactTen.css');
  const sequence = await read('src/modules/trips/ItinerarySequenceLeft.css');
  const dividers = await read('src/modules/trips/ItinerarySegmentDividers.css');
  const rail = await read('src/modules/trips/CountryRunRail.jsx');
  const legacyLayout = await read('src/app/ItineraryTripHeader.css');
  const main = await read('src/main.jsx');
  const form = await read('src/modules/trips/SegmentForm.jsx');

  assert.match(header, /className="itinerary-stop__sequence"[\s\S]*className="itinerary-stop__sequence-badge"[\s\S]*className=\{markerClassName\}/s);
  assert.match(header, /is-country-run-marker is-country-run-\$\{countryRunPosition\}/);
  assert.match(header, /className="itinerary-stop__metrics"/);
  assert.match(header, /className="itinerary-stop__date-range"/);
  assert.match(header, /formatSegmentDate\(segment\.startDate, locale\)/);
  assert.match(header, /formatSegmentDate\(segment\.endDate, locale\)/);
  assert.match(form, /locale=\{locale\}/);
  assert.match(css, /\.itinerary-origin__marker img,[\s\S]*\.itinerary-stop__marker img[\s\S]*width:\s*30px;[\s\S]*height:\s*20px;/);
  assert.doesNotMatch(header, /itinerary-stop__nights|segment__pill/);
  assert.doesNotMatch(origin, /itinerary-stop__nights|segment__pill/);
  assert.match(origin, /itinerary-stop__date-range/);
  assert.match(header, /itinerary-stop__amount/);
  assert.match(origin, /itinerary-stop__amount/);
  assert.match(compact, /--itinerary-compact-gap:\s*10px;/);
  assert.match(compact, /grid-template-columns:[\s\S]*var\(--country-run-drag-w, 14px\)[\s\S]*var\(--country-run-sequence-w, 19px\)[\s\S]*var\(--country-run-track-w, 30px\)[\s\S]*126px[\s\S]*minmax\(0, 1fr\);/s);
  assert.match(compact, /padding-left:\s*calc\([\s\S]*var\(--country-run-drag-w, 14px\)[\s\S]*var\(--country-run-sequence-w, 19px\)[\s\S]*grid-template-columns:\s*var\(--country-run-track-w, 30px\) 126px minmax\(0, 1fr\);/s);
  assert.match(sequence, /\.itinerary-stop__sequence[\s\S]*width:\s*19px;[\s\S]*\.itinerary-stop__marker[\s\S]*width:\s*30px;/s);
  assert.match(dividers, /left:\s*53px;/);
  assert.match(compact, /grid-template-columns:\s*minmax\(60px, 1fr\) 78px repeat\(3, 14px\);/);
  assert.match(compact, /\.itinerary-stop__metrics,[\s\S]*\.itinerary-origin__metrics\s*\{[^}]*display:\s*contents;/s);
  assert.match(compact, /\.itinerary-stop__date-range\s*\{[^}]*grid-column:\s*1;[^}]*width:\s*60px;[^}]*min-width:\s*60px;[^}]*max-width:\s*60px;[^}]*display:\s*flex;[^}]*flex-direction:\s*column;[^}]*color:\s*#667085;[^}]*font-size:\s*10px;[^}]*font-weight:\s*500;/s);
  assert.match(compact, /padding-left:\s*14px;[\s\S]*padding-right:\s*0;[\s\S]*column-gap:\s*8px;/s);
  assert.match(compact, /\.itinerary-stop__after-place > \.btn--icon,[\s\S]*width:\s*14px;[\s\S]*min-width:\s*14px;/s);
  assert.match(compact, /\.itinerary-stop__amount\s*\{[^}]*width:\s*78px;[^}]*min-width:\s*78px;[^}]*max-width:\s*78px;[^}]*padding:\s*0 2px 0 0;[^}]*color:\s*#5f5f5f;[^}]*font-size:\s*12px;[^}]*font-weight:\s*700;/s);
  assert.match(form, /countryRunPosition === 'middle' \? ' is-country-run-middle' : ''/);
  assert.match(
    dividers,
    /\.itinerary-stop__country-run-dot\s*\{[^}]*width:\s*var\(--country-run-dot-size\);[^}]*height:\s*var\(--country-run-dot-size\);[^}]*aspect-ratio:\s*1 \/ 1;[^}]*border-radius:\s*50%;[^}]*background:\s*var\(--country-run-track-color\);[^}]*box-shadow:\s*0 0 0 var\(--country-run-mask-gap\) var\(--country-run-surface\);/s
  );
  assert.match(
    dividers,
    /\.itinerary-country-run-rail\s*\{[^}]*position:\s*absolute;[^}]*z-index:\s*0;[^}]*inset-inline-start:\s*var\(--country-run-axis-inline\);[^}]*background-image:\s*linear-gradient\([\s\S]*to bottom,[\s\S]*var\(--country-run-track-color\) 0 var\(--country-run-dash-length\),[\s\S]*transparent var\(--country-run-dash-length\) var\(--country-run-dash-period\)[^}]*background-size:\s*100% var\(--country-run-dash-period\);/s
  );
  assert.match(
    dividers,
    /\.itinerary-stop__marker\.is-country-run-marker\s*\{[^}]*z-index:\s*1;[^}]*width:\s*var\(--country-run-track-w\);[^}]*justify-self:\s*center;/s
  );
  assert.doesNotMatch(dividers, /\.itinerary-stop__marker\.is-country-run-marker::(?:before|after)/);
  assert.doesNotMatch(dividers, /\.itinerary-segment\.is-country-run-joined::after\s*\{/);
  assert.match(form, /import \{ CountryRunRail \} from '\.\/CountryRunRail\.jsx';/);
  assert.match(rail, /createPortal\([\s\S]*itinerary-country-run-rail[\s\S]*railState\.container/s);
  assert.match(rail, /startBounds\.top \+ \(startBounds\.height \/ 2\)/);
  assert.match(rail, /endBounds\.top \+ \(endBounds\.height \/ 2\)/);
  assert.match(
    css,
    /\.itinerary-segment\.is-country-run-middle \.itinerary-stop__picker \.autocomplete__selected-value\s*\{[^}]*color:\s*#575757;[^}]*font-weight:\s*400;/s
  );

  assert.doesNotMatch(legacyLayout, /grid-template-columns:\s*48px 66px 66px 22px 22px 22px/);
  assert.doesNotMatch(legacyLayout, /itinerary-stop__after-place > \.btn--icon[\s\S]*width:\s*22px/s);
  assert.doesNotMatch(form, /import '\.\/ItineraryCompactTen\.css';/);
  assert.match(main, /import '\.\/modules\/trips\/ItineraryCompactTen\.css';/);
  assert.ok(
    main.indexOf("./modules/trips/ItineraryCompactTen.css") > main.indexOf("./app/ItineraryTripHeader.css") &&
      main.indexOf("./modules/trips/ItineraryCompactTen.css") > main.indexOf("./app/FloatingItineraryPanel.css"),
    'la retícula compacta debe cargarse al final para que ninguna geometría legacy la pise'
  );
});

test('origin mirrors note expand close controls while expand still opens the separate details module', async () => {
  const origin = await read('src/modules/trips/ItineraryOrigin.jsx');
  const header = await read('src/modules/trips/SegmentHeader.jsx');
  const compact = await read('src/modules/trips/ItineraryCompactTen.css');
  const modal = await read('src/modules/trips/ItineraryDetailsModal.jsx');

  assert.match(origin, /itinerary-stop__metrics itinerary-origin__metrics/);
  assert.match(origin, /itinerary-stop__date-range/);
  assert.match(origin, /itinerary-stop__amount/);
  assert.doesNotMatch(origin, /itinerary-stop__nights/);
  assert.match(origin, /segment__note-btn itinerary-origin__note-btn/);
  assert.match(origin, /segment__toggle segment__details-btn itinerary-origin__details-btn/);
  assert.match(origin, /itinerary-origin__clear/);
  assert.match(origin, /IconChevronDown/);
  assert.match(header, /segment__toggle segment__details-btn itinerary-stop__details-btn/);
  assert.match(header, /IconChevronDown/);
  assert.doesNotMatch(origin, /IconChevronRight|IconChevronUp|aria-expanded|aria-controls/);
  assert.doesNotMatch(compact, /height:\s*40px;[^}]*background:\s*var\(--atlas-accent\)/s);
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
