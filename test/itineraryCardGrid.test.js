// test-contract: behavior
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const root = new URL('../', import.meta.url);
const read = (path) => readFile(new URL(path, root), 'utf8');

test('itinerary keeps Add city above a single visible list and removes the layout choice from the UI', async () => {
  const pane = await read('src/app/AppEditorPane.jsx');
  const css = await read('src/modules/trips/ItineraryCompactList.css');

  const toolbarIndex = pane.indexOf('itinerary-card-toolbar');
  const cardsIndex = pane.indexOf('segments itinerary-cards');
  assert.ok(toolbarIndex >= 0 && cardsIndex > toolbarIndex);
  assert.match(pane, /<CityAutocomplete[\s\S]*onSelect=\{handleAddCity\}[\s\S]*placeholder=\{t\('addCity'\)\}/s);
  assert.match(css, /\.itinerary-layout-switch\s*\{\s*display:\s*none\s*!important;/s);
  assert.match(css, /\.segments\.itinerary-cards\.itinerary-cards--grid,[\s\S]*grid-template-columns:\s*minmax\(0,\s*1fr\)\s*!important;/s);
});

test('add city only creates or fills a card after a valid selection', async () => {
  const pane = await read('src/app/AppEditorPane.jsx');

  assert.match(pane, /const reusable = trip\.segments\.find\(isPristineDestinationSegment\)/);
  assert.match(pane, /updateSegment\(reusable\.id, \{ destination: city \}\)/);
  assert.match(pane, /addSegment\(\{ destination: city \}\)/);
  assert.doesNotMatch(pane, /className="btn btn--add" onClick=\{addSegment\}/);
});

test('origin remains a first-class row with its label over the thumbnail', async () => {
  const pane = await read('src/app/AppEditorPane.jsx');
  const origin = await read('src/modules/trips/ItineraryOrigin.jsx');

  assert.match(pane, /<SegmentOriginSection[\s\S]*onUpdateOrigin=\{updateOrigin\}/s);
  assert.match(origin, /itinerary-origin itinerary-origin--card itinerary-card__content/);
  assert.match(origin, /<ItineraryCityVisual city=\{city\}/);
  assert.match(origin, /itinerary-origin__badge/);
});

test('city thumbnail reuses existing Google Places search and photo infrastructure with a Tabler fallback', async () => {
  const visual = await read('src/modules/trips/ItineraryCityVisual.jsx');

  assert.match(visual, /searchGooglePlaces/);
  assert.match(visual, /loadGooglePlacePhoto/);
  assert.match(visual, /IntersectionObserver/);
  assert.match(visual, /cityPhotoCache/);
  assert.match(visual, /className="itinerary-card-city-photo"/);
  assert.match(visual, /itinerary-card-city-photo__attribution/);
  assert.match(visual, /from '@tabler\/icons-react'/);
  assert.match(visual, /<VisualIcon/);
  assert.doesNotMatch(visual, /fetch\(|https?:\/\//);
});

test('canonical number and existing drag interaction remain over each destination thumbnail', async () => {
  const header = await read('src/modules/trips/SegmentHeader.jsx');
  const pane = await read('src/app/AppEditorPane.jsx');

  assert.match(pane, /sequenceNumber=\{stopSequence\[index\]\?\.number \?\? null\}/);
  assert.match(header, /className="itinerary-stop__sequence-badge"[\s\S]*style=\{sequenceBadgeStyle\}/s);
  assert.match(header, /onPointerDown=\{onReorderPointerStart\}/);
  assert.match(header, /IconGripVertical/);
});

test('compact list composes thumbnail, flag-city, date, amount and centered actions without overlap', async () => {
  const header = await read('src/modules/trips/SegmentHeader.jsx');
  const origin = await read('src/modules/trips/ItineraryOrigin.jsx');
  const form = await read('src/modules/trips/SegmentForm.jsx');
  const css = await read('src/modules/trips/ItineraryCompactList.css');

  assert.doesNotMatch(header, /itinerary-card__footer|itinerary-card__metrics/);
  assert.doesNotMatch(origin, /itinerary-card__footer|itinerary-card__metrics/);
  assert.match(header, /itinerary-card__place[\s\S]*itinerary-card__date[\s\S]*itinerary-card__amount[\s\S]*itinerary-card__actions/s);
  assert.match(origin, /itinerary-card__place[\s\S]*itinerary-card__date[\s\S]*itinerary-card__amount[\s\S]*itinerary-card__actions/s);
  assert.match(form, /import '\.\/ItineraryCompactList\.css';/);
  assert.match(css, /grid-template-columns:\s*72px minmax\(0, 1fr\) 98px\s*!important;/);
  assert.match(css, /'visual place amount'[\s\S]*'visual date actions'/s);
  assert.match(css, /\.itinerary-card__visual-frame\s*\{[\s\S]*width:\s*72px\s*!important;[\s\S]*height:\s*72px\s*!important;[\s\S]*border-radius:\s*11px\s*!important;/s);
  assert.match(css, /autocomplete--timeline-selected:not\(\.is-open\) \.autocomplete__selected-value[\s\S]*font-weight:\s*700\s*!important;[\s\S]*-webkit-line-clamp:\s*2\s*!important;/s);
  assert.match(css, /\.itinerary-card__date\.itinerary-stop__date-range\s*\{[\s\S]*color:\s*#7a8389\s*!important;[\s\S]*font-weight:\s*400\s*!important;[\s\S]*white-space:\s*nowrap\s*!important;/s);
  assert.match(css, /\.itinerary-card__amount\.itinerary-stop__amount\s*\{[\s\S]*grid-area:\s*amount\s*!important;[\s\S]*justify-self:\s*end\s*!important;/s);
  assert.match(css, /\.itinerary-card__actions\s*\{[\s\S]*grid-area:\s*actions\s*!important;[\s\S]*justify-content:\s*center\s*!important;/s);
});

test('card dates keep complete month names on one line', async () => {
  const model = await read('src/modules/trips/segmentFormModel.js');
  const header = await read('src/modules/trips/SegmentHeader.jsx');
  const origin = await read('src/modules/trips/ItineraryOrigin.jsx');

  assert.match(model, /export function formatSegmentCardDate\(/);
  assert.match(model, /month:\s*'long'/);
  assert.match(model, /return `\$\{day\} \$\{capitalizedMonth\}`/);
  assert.match(model, /return `\$\{start\} - \$\{end\}`/);
  assert.match(header, /formatSegmentCardDateRange\(segment, locale\)/);
  assert.match(header, /\{formattedDateRange \|\| ''\}/);
  assert.match(origin, /\{formattedDepartureDate \|\| ''\}/);
});

test('note, details and remove actions remain permanently visible', async () => {
  const css = await read('src/modules/trips/ItineraryCompactList.css');

  assert.match(
    css,
    /\.itinerary-card__actions\s*\{[\s\S]*opacity:\s*1\s*!important;[\s\S]*visibility:\s*visible\s*!important;[\s\S]*pointer-events:\s*auto\s*!important;/s
  );
  assert.match(
    css,
    /\.itinerary-card__actions \.itinerary-card__action,[\s\S]*\.itinerary-card__actions \.itinerary-stop__remove-btn\s*\{[\s\S]*display:\s*grid\s*!important;/s
  );
});
