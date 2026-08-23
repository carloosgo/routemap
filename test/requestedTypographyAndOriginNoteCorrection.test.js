// test-contract: architecture
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const root = new URL('../', import.meta.url);
const read = (path) => readFile(new URL(path, root), 'utf8');

test('header summary typography remains isolated and origin shares destination hierarchy', async () => {
  const header = await read('src/app/TripSummaryHeaderTypography.css');
  const tripHeader = await read('src/app/TripSummaryHeader.jsx');
  const main = await read('src/main.jsx');
  const correction = await read('src/modules/trips/ItineraryCorrectionPolish.css');
  const originOptions = await read('src/modules/trips/OriginOptions.css');
  const timeline = await read('src/modules/trips/ItineraryTimeline.css');

  assert.match(header, /\.trip-summary__metric-label\s*\{[^}]*font-size:\s*11px;/s);
  assert.match(header, /\.trip-summary__metric-value,[\s\S]*font-size:\s*14px;/);
  assert.doesNotMatch(header, /trip-summary__title/);
  assert.doesNotMatch(tripHeader, /TripSummaryHeaderTypography\.css/);
  assert.ok(
    main.indexOf("./app/TripSummaryHeader.css") <
      main.indexOf("./app/TripSummaryHeaderTypography.css"),
    'la escala solicitada debe cargarse después del stylesheet canónico del header'
  );

  assert.doesNotMatch(correction, /itinerary-origin__picker \.autocomplete__selected-value/);
  assert.doesNotMatch(correction, /itinerary-origin__country/);
  assert.match(
    originOptions,
    /itinerary-origin__picker \.autocomplete__selected-value[\s\S]*font-size:\s*13px;[\s\S]*font-weight:\s*700;/
  );
  assert.match(
    timeline,
    /itinerary-origin__country,[\s\S]*itinerary-stop__country[\s\S]*font-size:\s*9\.5px;[\s\S]*font-weight:\s*500;/
  );

  assert.match(correction, /moneycard__label,[\s\S]*font-size:\s*13px;/);
  assert.match(correction, /moneycard__input,[\s\S]*font-size:\s*12px;/);
  assert.match(correction, /moneycard__currency,[\s\S]*font-size:\s*11px;/);
  assert.match(correction, /expenses__add-other\s*\{[^}]*font-size:\s*13px;/s);
});

test('header trial owns the three primary tabs, omits the routes counter, keeps notes progress, and retires legacy sidebar tabs', async () => {
  const navigation = await read('src/app/TripHeaderNavigation.jsx');
  const navigationCss = await read('src/app/TripHeaderNavigation.css');
  const tripHeader = await read('src/app/TripSummaryHeader.jsx');
  const editorModule = await read('src/app/AppEditorModule.jsx');
  const app = await read('src/App.jsx');
  const main = await read('src/main.jsx');

  assert.match(navigation, /IconListDetails/);
  assert.match(navigation, /IconRoute/);
  assert.match(navigation, /IconNotebook/);
  assert.doesNotMatch(navigation, /IconMap\b|IconNotes\b|lugaresIcon/);
  assert.match(navigation, /id: 'segments'/);
  assert.match(navigation, /id: 'places'/);
  assert.match(navigation, /id: 'notes'/);
  assert.doesNotMatch(navigation, /id === 'places' \? routeCount|badge--places/);
  assert.match(navigation, /const badge = id === 'notes' \? checklistProgress : '';/);
  assert.match(navigation, /onClick=\{\(\) => setActiveTab\(id\)\}/);

  assert.match(tripHeader, /<TripHeaderNavigation \{\.\.\.navigation\} t=\{t\} \/>/);
  assert.doesNotMatch(tripHeader, /className="trip-summary__title"|renameTrip/);
  assert.doesNotMatch(editorModule, /editor-module__tabs|editor-module__nav-tab|lugaresIcon|IconNotes|IconMap\b/);
  assert.match(app, /checklistProgress: editorState\.checklist\?\.length/);

  assert.match(navigationCss, /grid-template-columns:\s*repeat\(3, minmax\(0, 1fr\)\)/);
  assert.match(navigationCss, /\.editor-module\s*\{\s*grid-template-columns:\s*minmax\(0, 1fr\);/s);
  assert.doesNotMatch(navigationCss, /\.trip-summary__primary-nav-badge--places/);
  assert.match(navigationCss, /\.trip-summary__primary-nav-badge--notes/);
  assert.ok(
    main.indexOf("./app/ItinerarySidebar.css") < main.indexOf("./app/TripHeaderNavigation.css"),
    'el override que libera la columna lateral debe cargar después del sidebar canónico'
  );
  assert.ok(
    main.indexOf("./app/TripSummaryHeaderTypography.css") < main.indexOf("./app/TripHeaderNavigation.css"),
    'la navegación del header debe cargar después de los estilos canónicos de métricas'
  );
});

test('origin and segment notes keep one toggle path while details use the parallel note-style surface', async () => {
  const form = await read('src/modules/trips/SegmentForm.jsx');
  const origin = await read('src/modules/trips/SegmentOriginSection.jsx');
  const body = await read('src/modules/trips/OriginBody.jsx');
  const map = await read('src/app/AppMapPane.jsx');
  const app = await read('src/App.jsx');
  const editorModule = await read('src/app/AppEditorModule.jsx');
  const editorPane = await read('src/app/AppEditorPane.jsx');
  const interactions = await read('src/app/useAppInteractions.js');

  assert.match(form, /ORIGIN_NOTE_TARGET/);
  assert.match(form, /const openSegmentNote = \(\) => onOpenNote\(segment\.id\);/);
  assert.match(form, /const openOriginNote = \(\) => onOpenNote\(ORIGIN_NOTE_TARGET\);/);
  assert.match(form, /const openSegmentDetails = \(\) => onOpenDetails\(segment\.id\);/);
  assert.match(form, /const openOriginDetails = \(\) => onOpenDetails\(ORIGIN_NOTE_TARGET\);/);
  assert.match(form, /onOpenNote=\{openOriginNote\}/);
  assert.match(form, /onOpenNote=\{openSegmentNote\}/);
  assert.match(origin, /onOpenNote=\{onOpenNote\}/);
  assert.match(origin, /onOpenDetails=\{onOpenDetails\}/);
  assert.doesNotMatch(body, /itinerary-origin__note-editor|<textarea/);

  assert.match(app, /setOpenDetailsTarget\(null\);[\s\S]*setOpenNoteSegmentId/s);
  assert.match(app, /setOpenNoteSegmentId\(null\);[\s\S]*setOpenDetailsTarget/s);
  assert.match(app, /toggleNoteTarget=\{toggleNoteTarget\}/);
  assert.match(app, /toggleDetailsTarget=\{toggleDetailsTarget\}/);
  assert.match(editorModule, /toggleDetailsTarget=\{toggleDetailsTarget\}/);
  assert.match(editorPane, /onOpenDetails=\{toggleDetailsTarget\}/);
  assert.match(interactions, /\.segment__note-btn, \.segment__details-btn/);
  assert.doesNotMatch(interactions, /suppressNextClick|clickedSegmentId|openSegmentId/);

  assert.match(map, /openNoteSegmentId === ORIGIN_NOTE_TARGET/);
  assert.equal((map.match(/className="segnote"/g) || []).length, 2);
  assert.equal((map.match(/className="segnote__textarea"/g) || []).length, 2);
  assert.match(map, /updateOriginDetails\(\{ note: event\.target\.value \}\)/);
  assert.match(map, /updateSegment\(segment\.id, \{ note: event\.target\.value \}\)/);
  assert.match(map, /const notePanel = openNoteSegmentId \? openNotePanel\(\) : null;/);
  assert.match(map, /const detailsPanel = openDetailsTarget \?/);
  assert.match(map, /\{detailsPanel\}/);
  assert.match(map, /data-persistence-state=\{persistenceState\}/);
});

test('desktop itinerary uses compact equal rows, fixed 56px metrics and centered floating card', async () => {
  const correction = await read('src/modules/trips/ItineraryCorrectionPolish.css');
  const compact = await read('src/modules/trips/ItineraryCompactTen.css');
  const floatingEditor = await read('src/app/FloatingEditor.css');

  assert.doesNotMatch(correction, /scrollbar-gutter:\s*stable/);
  assert.match(
    compact,
    /\.workspace-panel:has\(\.editor-module--itinerary\)\s*\{[^}]*top:\s*calc\(50% \+ 31\.5px\);[^}]*396px[\s\S]*transform:\s*translateY\(-50%\);/s
  );
  assert.match(
    compact,
    /\.editor-module--itinerary \.editor__body\s*\{[^}]*overflow-y:\s*auto;[^}]*scrollbar-width:\s*none;[^}]*padding-top:\s*6px;/s
  );
  assert.match(compact, /\.itinerary-origin-section\s*\{[^}]*margin:\s*0;/s);
  assert.match(compact, /min-height:\s*48px;[^}]*height:\s*48px;/s);
  assert.match(compact, /grid-template-columns:\s*42px 56px 56px 22px 22px 18px;/);
  assert.match(compact, /width:\s*56px\s*!important;[\s\S]*max-width:\s*56px\s*!important;/);
  assert.doesNotMatch(compact, /grid-template-columns:\s*42px max-content max-content/);
  assert.doesNotMatch(floatingEditor, /Densidad compacta nativa|reproduce la sensación del navegador al 90%/);
});
