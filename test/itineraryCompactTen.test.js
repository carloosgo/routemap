// test-contract: architecture
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const root = new URL('../', import.meta.url);
const read = (path) => readFile(new URL(path, root), 'utf8');

test('desktop itinerary keeps compact equal rows, visible scrollbar and aligned date summaries', async () => {
  const compact = await read('src/modules/trips/ItineraryCompactTen.css');
  const floating = await read('src/app/FloatingItineraryPanel.css');
  const floatingEditor = await read('src/app/FloatingEditor.css');
  const form = await read('src/modules/trips/SegmentForm.jsx');
  const correction = await read('src/modules/trips/ItineraryCorrectionPolish.css');
  const header = await read('src/modules/trips/SegmentHeader.jsx');
  const originRow = await read('src/modules/trips/ItineraryOrigin.jsx');

  assert.match(compact, /@media \(min-width:\s*721px\)/);
  assert.doesNotMatch(floating, /:has\(\.editor-module--itinerary\)/);
  assert.match(floating, /\.workspace__desktop--column\s*\{[^}]*display:\s*grid;[^}]*grid-template-columns:\s*var\(--workspace-panel-width\) minmax\(0, 1fr\);/s);
  assert.match(floating, /\.workspace-panel\s*\{[^}]*position:\s*relative;[^}]*width:\s*100%;[^}]*height:\s*100%;[^}]*display:\s*block;/s);
  assert.match(floating, /\.workspace-panel__content\.floating-editor\s*\{[^}]*width:\s*100%\s*!important;[^}]*height:\s*100%\s*!important;[^}]*transform:\s*none\s*!important;/s);
  assert.doesNotMatch(floating, /scale\(|zoom:/);

  assert.match(compact, /\.editor-module--itinerary \.editor__body\s*\{[^}]*--itinerary-compact-gap:\s*10px;[^}]*overflow-y:\s*auto;[^}]*scrollbar-gutter:\s*stable;[^}]*scrollbar-width:\s*thin;[^}]*padding:\s*0 2px 6px 10px;/s);
  assert.match(compact, /\.editor-module--itinerary \.editor__body::-webkit-scrollbar\s*\{[^}]*width:\s*7px;[^}]*display:\s*block;/s);

  assert.match(compact, /\.itinerary-origin-section\s*\{[^}]*margin:\s*0;/s);
  assert.match(compact, /\.itinerary-origin,[\s\S]*segment__header\.itinerary-stop\s*\{[^}]*min-height:\s*40px;[^}]*height:\s*40px;[^}]*align-items:\s*center;/s);
  assert.match(compact, /grid-template-columns:[\s\S]*var\(--country-run-drag-w, 14px\)[\s\S]*var\(--country-run-sequence-w, 19px\)[\s\S]*var\(--country-run-track-w, 30px\)[\s\S]*126px[\s\S]*minmax\(0, 1fr\);/s);
  assert.match(compact, /\.itinerary-origin\s*\{[^}]*padding-left:\s*calc\([\s\S]*var\(--country-run-drag-w, 14px\)[\s\S]*var\(--country-run-sequence-w, 19px\)[\s\S]*grid-template-columns:\s*var\(--country-run-track-w, 30px\) 126px minmax\(0, 1fr\);[^}]*column-gap:\s*var\(--itinerary-compact-gap\);/s);
  assert.match(compact, /column-gap:\s*var\(--itinerary-compact-gap\);/);
  assert.match(compact, /max-width:\s*126px;/);
  assert.match(compact, /autocomplete__selected-value[\s\S]*transform:\s*none;[\s\S]*font-size:\s*13px;[\s\S]*font-weight:\s*600;[\s\S]*white-space:\s*nowrap;/s);

  assert.match(compact, /\.itinerary-stop__after-place,[\s\S]*\.itinerary-origin__after-place\s*\{[^}]*grid-template-columns:\s*minmax\(60px, 1fr\) 78px repeat\(3, 14px\);[^}]*column-gap:\s*8px;/s);
  assert.match(compact, /\.itinerary-stop__metrics,[\s\S]*\.itinerary-origin__metrics\s*\{[^}]*display:\s*contents;/s);
  assert.match(compact, /padding-left:\s*0;[\s\S]*padding-right:\s*0;[\s\S]*column-gap:\s*8px;/s);
  assert.match(compact, /\.itinerary-stop__after-place > \.btn--icon,[\s\S]*width:\s*14px;[\s\S]*min-width:\s*14px;[\s\S]*height:\s*22px;/s);
  assert.match(compact, /\.itinerary-stop__after-place > \.btn--icon::before,[\s\S]*inset:\s*-4px;/s);
  assert.match(compact, /\.itinerary-stop__date-range\s*\{[^}]*grid-column:\s*1;[^}]*width:\s*60px;[^}]*min-width:\s*60px;[^}]*max-width:\s*60px;[^}]*display:\s*flex;[^}]*flex-direction:\s*column;[^}]*align-items:\s*flex-end;[^}]*color:\s*#0d6078;[^}]*font-size:\s*10px;[^}]*font-weight:\s*500;[^}]*text-align:\s*right;/s);
  assert.match(compact, /\.itinerary-stop__amount\s*\{[^}]*width:\s*78px;[^}]*min-width:\s*78px;[^}]*max-width:\s*78px;[^}]*color:\s*#5f5f5f;[^}]*font-size:\s*12px;[^}]*font-weight:\s*700;[^}]*text-align:\s*right;[^}]*overflow:\s*visible;/s);
  assert.match(compact, /\.itinerary-segment \.itinerary-stop__amount,[\s\S]*\.itinerary-origin \.itinerary-stop__amount\s*\{[^}]*grid-column:\s*2;[^}]*grid-row:\s*1;/s);
  assert.doesNotMatch(compact, /\.itinerary-stop__dates|\.itinerary-stop__nights|segment__pill|background:\s*var\(--atlas-accent\)/);
  assert.match(header, /itinerary-stop__date-range/);
  assert.match(header, /formatSegmentDate\(segment\.startDate, locale\)/);
  assert.match(header, /formatSegmentDate\(segment\.endDate, locale\)/);
  assert.match(header, /<span>\{formattedStartDate \|\| ''\}<\/span>[\s\S]*<span>\{formattedEndDate \|\| ''\}<\/span>/s);
  assert.doesNotMatch(header, /itinerary-stop__country(?:["'\s])|itinerary-stop__nights|itinerary-stop__dates/);
  assert.doesNotMatch(originRow, /itinerary-origin__country|itinerary-stop__nights|itinerary-stop__dates/);
  assert.match(originRow, /itinerary-stop__date-range/);
  assert.match(originRow, /\{formattedDepartureDate \|\| ''\}/);
  assert.match(originRow, /<span aria-hidden="true" \/>/);
  assert.match(header, /itinerary-stop__amount/);
  assert.match(originRow, /itinerary-stop__amount/);

  assert.doesNotMatch(floatingEditor, /Densidad compacta nativa|reproduce la sensación del navegador al 90%/);
  assert.doesNotMatch(floatingEditor, /\.floating-editor \.segment__badge|\.floating-editor \.segment__header \.btn--icon svg|\.floating-editor \.segment__pill/);
  assert.doesNotMatch(correction, /itinerary-origin__picker \.autocomplete__selected-value/);

  assert.match(form, /formatSegmentAmount/);
  assert.doesNotMatch(form, /formatSegmentDate|formatSegmentNights|formattedStartDate|formattedEndDate|formattedNights|CollapsibleRegion|<SegmentBody|onToggle=|expanded=/);
  assert.doesNotMatch(form, /useExpandedSegmentReveal|scrollIntoView/);
});

test('note expand and close keep their order while expand opens a symmetric note-style detail modal', async () => {
  const header = await read('src/modules/trips/SegmentHeader.jsx');
  const origin = await read('src/modules/trips/ItineraryOrigin.jsx');
  const modal = await read('src/modules/trips/ItineraryDetailsModal.jsx');
  const modalCss = await read('src/modules/trips/ItineraryDetailsModal.css');
  const money = await read('src/components/MoneyInput.jsx');
  const fixed = await read('src/modules/expenses/FixedExpenseCards.jsx');
  const floating = await read('src/app/FloatingItineraryPanel.css');
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

  assert.doesNotMatch(header, /itinerary-stop__dates|itinerary-stop__nights|segment__pill/);
  assert.doesNotMatch(origin, /itinerary-stop__dates|itinerary-stop__nights|segment__pill/);
  assert.match(header, /itinerary-stop__date-range/);
  assert.match(origin, /itinerary-stop__date-range/);
  assert.match(header, /itinerary-stop__amount/);
  assert.match(origin, /itinerary-stop__amount/);

  assert.match(modal, /className="segnote segment-details-modal"/);
  assert.match(modal, /<SegmentBody/);
  assert.match(modal, /<OriginBody/);
  assert.match(modal, /updateSegment\(segment\.id, patch\)/);
  assert.match(modal, /updateExpenses\(segment\.id, expenses\)/);
  assert.match(modalCss, /\.segment-details-modal \.segment__body,[\s\S]*width:\s*100%;[\s\S]*padding:\s*14px 8px 16px\s*!important;[\s\S]*background:\s*#ffffff\s*!important;/s);
  assert.match(modalCss, /--expense-column-gap:\s*10px;/);
  assert.match(modalCss, /\.segment-expense-form \.dates,[\s\S]*width:\s*100%;[\s\S]*max-width:\s*none;/s);
  assert.match(modalCss, /grid-template-columns:\s*repeat\(2, minmax\(0, 1fr\)\);/);
  assert.match(modalCss, /\.segment-expense-form \.calendar-date,[\s\S]*width:\s*100%\s*!important;[\s\S]*max-width:\s*none\s*!important;/s);
  assert.match(modalCss, /calendar-date__value,[\s\S]*width:\s*calc\(100% - 30px\);/s);
  assert.match(modalCss, /calendar-date__clear,[\s\S]*right:\s*5px;/s);
  assert.match(modalCss, /\.segment-details-modal \.calendar-date__popover\s*\{[^}]*top:\s*calc\(100% \+ 4px\);[^}]*width:\s*252px;[^}]*padding:\s*9px;/s);
  assert.match(modalCss, /\.segment-details-modal \.calendar-date__header\s*\{[^}]*grid-template-columns:\s*26px 1fr 26px;[^}]*margin-bottom:\s*6px;/s);
  assert.match(modalCss, /\.segment-details-modal \.calendar-date__weekdays span\s*\{[^}]*height:\s*18px;/s);
  assert.match(modalCss, /\.segment-details-modal \.calendar-date__day\s*\{[^}]*width:\s*24px;[^}]*height:\s*24px;[^}]*font-size:\s*10px;/s);
  assert.match(fixed, /<MoneyCard[\s\S]*centered/);
  assert.match(money, /gridTemplateColumns:\s*'18px minmax\(64px, 82px\) minmax\(60px, 70px\)'/);
  assert.match(money, /width:\s*'min\(178px, calc\(100% - 12px\)\)'/);
  assert.match(money, /justifyContent:\s*'center'/);
  assert.match(money, /justifySelf:\s*'center'/);
  assert.match(modalCss, /\.moneycard__label\s*\{[^}]*overflow:\s*hidden;[^}]*text-overflow:\s*clip;[^}]*white-space:\s*normal;/s);
  assert.match(modalCss, /\.moneycard__typeinput\s*\{[^}]*overflow:\s*hidden;[^}]*white-space:\s*nowrap;/s);
  assert.match(modalCss, /\.moneycard__amount\s*\{[^}]*width:\s*70px;[^}]*min-width:\s*70px;/s);
  assert.match(floating, /:has\(\.segment-details-modal\) \.workspace-panel__toggle\s*\{[^}]*opacity:\s*0;[^}]*pointer-events:\s*none;/s);

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

test('itinerary dividers stay dotted from flag start to close icon end', async () => {
  const dividers = await read('src/modules/trips/ItinerarySegmentDividers.css');
  const floating = await read('src/app/FloatingItineraryPanel.css');

  assert.match(dividers, /#c9ced7 0 3px,[\s\S]*transparent 3px 7px/);
  assert.match(dividers, /\.itinerary-origin-section \+ \.itinerary-segment::before/);
  assert.match(dividers, /\.itinerary-segment \+ \.itinerary-segment::before/);
  assert.match(dividers, /left:\s*53px;[\s\S]*right:\s*4px;/);
  assert.doesNotMatch(dividers, /M0 0 L4 4|fill='%2319a5d0'|clip-path/);

  assert.match(floating, /\.workspace-panel__content\.floating-editor\s*\{[^}]*background:\s*var\(--bg\)\s*!important;[^}]*border:\s*0\s*!important;[^}]*border-radius:\s*0\s*!important;[^}]*box-shadow:\s*none\s*!important;/s);
});
