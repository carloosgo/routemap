// test-contract: architecture
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const root = new URL('../', import.meta.url);
const read = (path) => readFile(new URL(path, root), 'utf8');

test('desktop itinerary keeps compact equal rows, wider city text and unclipped plain metrics', async () => {
  const compact = await read('src/modules/trips/ItineraryCompactTen.css');
  const floating = await read('src/app/FloatingItineraryPanel.css');
  const floatingEditor = await read('src/app/FloatingEditor.css');
  const form = await read('src/modules/trips/SegmentForm.jsx');
  const correction = await read('src/modules/trips/ItineraryCorrectionPolish.css');
  const header = await read('src/modules/trips/SegmentHeader.jsx');
  const originRow = await read('src/modules/trips/ItineraryOrigin.jsx');

  assert.match(compact, /@media \(min-width:\s*721px\)/);
  assert.doesNotMatch(compact, /workspace-panel:has\(\.editor-module--itinerary\)/);
  assert.match(floating, /\.workspace-panel\s*\{[^}]*top:\s*calc\(var\(--trip-header-height\) \+ 14px\);[^}]*bottom:\s*14px;/s);
  assert.match(compact, /\.editor-module--itinerary \.editor__body\s*\{[^}]*overflow-y:\s*auto;[^}]*scrollbar-width:\s*none;[^}]*padding-top:\s*6px;[^}]*padding-bottom:\s*6px;/s);
  assert.match(compact, /\.editor-module--itinerary \.editor__body::-webkit-scrollbar\s*\{[^}]*display:\s*none;/s);

  assert.match(compact, /\.itinerary-origin-section\s*\{[^}]*margin:\s*0;/s);
  assert.match(compact, /\.itinerary-origin,[\s\S]*segment__header\.itinerary-stop\s*\{[^}]*min-height:\s*48px;[^}]*height:\s*48px;[^}]*align-items:\s*center;/s);
  assert.match(compact, /grid-template-columns:\s*18px 30px 126px minmax\(0, 1fr\);/);
  assert.match(compact, /grid-template-columns:\s*30px 126px minmax\(0, 1fr\);/);
  assert.match(compact, /max-width:\s*126px;/);
  assert.match(compact, /autocomplete__selected-value[\s\S]*transform:\s*none;[\s\S]*font-size:\s*13px;[\s\S]*font-weight:\s*600;[\s\S]*white-space:\s*nowrap;/s);

  assert.match(compact, /grid-template-columns:\s*64px minmax\(86px, 1fr\) 22px 22px 22px;/);
  assert.match(compact, /\.itinerary-stop__nights,[\s\S]*\.itinerary-stop__amount\s*\{[^}]*font-size:\s*13px;[^}]*font-weight:\s*400;[^}]*overflow:\s*visible;/s);
  assert.doesNotMatch(compact, /\.itinerary-stop__nights\.segment__pill|width:\s*56px\s*!important|background:\s*var\(--atlas-accent\)/);
  assert.doesNotMatch(header, /itinerary-stop__country/);
  assert.doesNotMatch(originRow, /itinerary-origin__country/);

  assert.doesNotMatch(floatingEditor, /Densidad compacta nativa|reproduce la sensación del navegador al 90%/);
  assert.doesNotMatch(floatingEditor, /\.floating-editor \.segment__badge|\.floating-editor \.segment__header \.btn--icon svg|\.floating-editor \.segment__pill/);
  assert.doesNotMatch(correction, /itinerary-origin__picker \.autocomplete__selected-value/);

  assert.match(form, /import '\.\/ItineraryCompactTen\.css';/);
  assert.doesNotMatch(form, /formatSegmentDates|formattedDates|CollapsibleRegion|<SegmentBody|onToggle=|expanded=/);
  assert.doesNotMatch(form, /useExpandedSegmentReveal|scrollIntoView/);
});

test('note expand and close keep their order while expand opens the note-style detail modal', async () => {
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
  assert.match(modalCss, /grid-template-columns:\s*18px minmax\(0, 1fr\) 74px;/);
  assert.match(modalCss, /\.moneycard__amount\s*\{[^}]*width:\s*74px;[^}]*min-width:\s*74px;/s);

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

test('itinerary dividers stay dotted without lateral triangles', async () => {
  const dividers = await read('src/modules/trips/ItinerarySegmentDividers.css');
  const floating = await read('src/app/FloatingItineraryPanel.css');

  assert.match(dividers, /#c9ced7 0 3px,[\s\S]*transparent 3px 7px/);
  assert.match(dividers, /\.itinerary-origin-section \+ \.itinerary-segment::before/);
  assert.match(dividers, /\.itinerary-segment \+ \.itinerary-segment::before/);
  assert.doesNotMatch(dividers, /::after|M0 0 L4 4|fill='%2319a5d0'|clip-path/);

  assert.match(floating, /\.workspace-panel__content\.floating-editor\s*\{[^}]*background:\s*#ffffff\s*!important;[^}]*border:\s*1px solid rgba\(226, 228, 233, 0\.94\)\s*!important;/s);
});
