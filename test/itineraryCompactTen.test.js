// test-contract: architecture
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const root = new URL('../', import.meta.url);
const read = (path) => readFile(new URL(path, root), 'utf8');

test('desktop itinerary keeps compact equal rows, plain metrics and the same panel height as routes and notes', async () => {
  const compact = await read('src/modules/trips/ItineraryCompactTen.css');
  const floating = await read('src/app/FloatingItineraryPanel.css');
  const floatingEditor = await read('src/app/FloatingEditor.css');
  const form = await read('src/modules/trips/SegmentForm.jsx');
  const correction = await read('src/modules/trips/ItineraryCorrectionPolish.css');
  const timeline = await read('src/modules/trips/ItineraryTimeline.css');
  const origin = await read('src/modules/trips/OriginOptions.css');

  assert.match(compact, /@media \(min-width:\s*721px\)/);
  assert.doesNotMatch(compact, /workspace-panel:has\(\.editor-module--itinerary\)/);
  assert.match(floating, /\.workspace-panel\s*\{[^}]*top:\s*calc\(var\(--trip-header-height\) \+ 14px\);[^}]*bottom:\s*14px;/s);
  assert.match(compact, /\.editor-module--itinerary \.editor__body\s*\{[^}]*overflow-y:\s*auto;[^}]*scrollbar-width:\s*none;[^}]*padding-top:\s*6px;[^}]*padding-bottom:\s*6px;/s);
  assert.match(compact, /\.editor-module--itinerary \.editor__body::-webkit-scrollbar\s*\{[^}]*display:\s*none;/s);

  assert.match(compact, /\.itinerary-origin-section\s*\{[^}]*margin:\s*0;/s);
  assert.match(compact, /\.itinerary-origin,[\s\S]*segment__header\.itinerary-stop\s*\{[^}]*min-height:\s*48px;[^}]*height:\s*48px;[^}]*align-items:\s*center;/s);
  assert.match(compact, /\.itinerary-segment\.segment,[\s\S]*padding-bottom:\s*0\s*!important;/s);
  assert.doesNotMatch(compact, /itinerary-stop__marker\s*\{[^}]*width|itinerary-stop__place\s*\{[^}]*max-width/s);

  assert.match(compact, /grid-template-columns:\s*76px 92px 22px 22px 22px;/);
  assert.match(compact, /\.itinerary-stop__nights,[\s\S]*\.itinerary-stop__amount\s*\{[^}]*border:\s*0;[^}]*background:\s*transparent\s*!important;[^}]*font-size:\s*13px;/s);
  assert.doesNotMatch(compact, /\.itinerary-stop__nights\.segment__pill|width:\s*56px\s*!important|background:\s*var\(--atlas-accent\)/);

  assert.doesNotMatch(floatingEditor, /Densidad compacta nativa|reproduce la sensación del navegador al 90%/);
  assert.doesNotMatch(floatingEditor, /\.floating-editor \.segment__badge|\.floating-editor \.segment__header \.btn--icon svg|\.floating-editor \.segment__pill/);
  assert.doesNotMatch(correction, /itinerary-origin__picker \.autocomplete__selected-value|itinerary-origin__country/);
  assert.match(origin, /itinerary-origin__picker \.autocomplete__selected-value[\s\S]*font-size:\s*13px;[\s\S]*font-weight:\s*700;/);
  assert.match(timeline, /itinerary-origin__country,[\s\S]*itinerary-stop__country[\s\S]*font-size:\s*9\.5px;[\s\S]*font-weight:\s*500;/);

  assert.match(form, /import '\.\/ItineraryCompactTen\.css';/);
  assert.doesNotMatch(form, /formatSegmentDates|formattedDates|CollapsibleRegion|<SegmentBody|onToggle=|expanded=/);
  assert.doesNotMatch(form, /useExpandedSegmentReveal|scrollIntoView/);
});

test('note expand and close restore the old icon order while expand keeps the note-style detail modal', async () => {
  const header = await read('src/modules/trips/SegmentHeader.jsx');
  const origin = await read('src/modules/trips/ItineraryOrigin.jsx');
  const modal = await read('src/modules/trips/ItineraryDetailsModal.jsx');
  const modalCss = await read('src/modules/trips/ItineraryDetailsModal.css');
  const map = await read('src/app/AppMapPane.jsx');
  const app = await read('src/App.jsx');
  const panels = await read('src/app/useItineraryFloatingPanels.js');
  const interactions = await read('src/app/useAppInteractions.js');

  assert.match(header, /segment__note-btn[\s\S]*segment__toggle segment__details-btn itinerary-stop__details-btn[\s\S]*aria-label=\{t\('removeSegment'\)\}/s);
  assert.match(origin, /segment__note-btn itinerary-origin__note-btn[\s\S]*segment__toggle segment__details-btn itinerary-origin__details-btn[\s\S]*itinerary-origin__clear/s);
  assert.match(header, /IconChevronDown/);
  assert.match(origin, /IconChevronDown/);
  assert.doesNotMatch(header, /IconChevronRight|IconChevronUp|aria-expanded|aria-controls/);
  assert.doesNotMatch(origin, /IconChevronRight|IconChevronUp|aria-expanded|aria-controls/);

  assert.doesNotMatch(header, /itinerary-stop__dates|segment__pill/);
  assert.doesNotMatch(origin, /itinerary-stop__dates|segment__pill/);
  assert.match(header, /itinerary-stop__nights/);
  assert.match(header, /itinerary-stop__amount/);

  assert.match(modal, /className="segnote segment-details-modal"/);
  assert.match(modal, /<SegmentBody/);
  assert.match(modal, /<OriginBody/);
  assert.match(modal, /updateSegment\(segment\.id, patch\)/);
  assert.match(modal, /updateExpenses\(segment\.id, expenses\)/);
  assert.match(modalCss, /\.segment-details-modal \.segment__body,[\s\S]*width:\s*100%;[\s\S]*background:\s*#ffffff\s*!important;/s);

  assert.match(app, /const itineraryPanels = useItineraryFloatingPanels\(\);/);
  assert.match(app, /itineraryPanels=\{itineraryPanels\}/);
  assert.match(panels, /const \[detailsTarget, setDetailsTarget\] = useState\(null\);/);
  assert.match(panels, /const toggleDetails = useCallback/);
  assert.match(panels, /useOutsideClickSelector\('\.segnote'/);
  assert.match(map, /const \{ noteTarget, detailsTarget, close \} = itineraryPanels;/);
  assert.match(map, /const detailsPanel = detailsTarget \?/);
  assert.match(map, /<ItineraryDetailsModal/);
  assert.match(interactions, /\.segment__note-btn, \.segment__details-btn/);
});

test('ticket picos keep the approved solid Atlas-blue treatment', async () => {
  const dividers = await read('src/modules/trips/ItinerarySegmentDividers.css');
  const floating = await read('src/app/FloatingItineraryPanel.css');

  assert.match(dividers, /#c9ced7 0 3px,[\s\S]*transparent 3px 7px/);
  assert.match(dividers, /\.itinerary-origin-section \+ \.itinerary-segment::before/);
  assert.match(dividers, /\.itinerary-segment \+ \.itinerary-segment::before/);
  assert.match(dividers, /M0 0 L4 4 L0 8 Z M500 0 L496 4 L500 8 Z/);
  assert.match(dividers, /fill='%2319a5d0'/);
  assert.doesNotMatch(dividers, /clip-path|fill='%23ffffff'|fill='none' stroke='%23c9ced7'/);

  assert.match(floating, /\.workspace-panel__content\.floating-editor\s*\{[^}]*background:\s*#ffffff\s*!important;[^}]*border:\s*1px solid rgba\(226, 228, 233, 0\.94\)\s*!important;/s);
});
