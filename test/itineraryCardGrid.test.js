// test-contract: behavior
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const root = new URL('../', import.meta.url);
const read = (path) => readFile(new URL(path, root), 'utf8');

test('itinerary defaults to the two-column grid and still offers one-card list view', async () => {
  const pane = await read('src/app/AppEditorPane.jsx');
  const css = await read('src/modules/trips/ItineraryCardVisual.css');

  assert.match(pane, /useState\('grid'\)/);
  assert.match(pane, /itinerary-cards--\$\{itineraryLayout\}/);
  assert.match(pane, /setItineraryLayout\('list'\)/);
  assert.match(pane, /setItineraryLayout\('grid'\)/);
  assert.match(
    css,
    /\.itinerary-cards\.itinerary-cards--list\s*\{[\s\S]*grid-template-columns:\s*minmax\(0,\s*1fr\)\s*!important;/s
  );
  assert.match(
    css,
    /\.itinerary-cards\.itinerary-cards--grid\s*\{[\s\S]*grid-template-columns:\s*repeat\(2,\s*minmax\(0,\s*1fr\)\)\s*!important;/s
  );
});

test('add city control stays above cards and only creates or fills a card after selection', async () => {
  const pane = await read('src/app/AppEditorPane.jsx');

  const toolbarIndex = pane.indexOf('itinerary-card-toolbar');
  const cardsIndex = pane.indexOf('segments itinerary-cards');
  assert.ok(toolbarIndex >= 0 && cardsIndex > toolbarIndex);
  assert.match(pane, /<CityAutocomplete[\s\S]*onSelect=\{handleAddCity\}[\s\S]*placeholder=\{t\('addCity'\)\}/s);
  assert.match(pane, /const reusable = trip\.segments\.find\(isPristineDestinationSegment\)/);
  assert.match(pane, /updateSegment\(reusable\.id, \{ destination: city \}\)/);
  assert.match(pane, /addSegment\(\{ destination: city \}\)/);
  assert.doesNotMatch(pane, /className="btn btn--add" onClick=\{addSegment\}/);
});

test('origin is rendered as a first-class card inside both itinerary layouts', async () => {
  const pane = await read('src/app/AppEditorPane.jsx');
  const origin = await read('src/modules/trips/ItineraryOrigin.jsx');
  const css = await read('src/modules/trips/ItineraryCardVisual.css');

  assert.match(pane, /<SegmentOriginSection[\s\S]*onUpdateOrigin=\{updateOrigin\}/s);
  assert.match(origin, /itinerary-origin itinerary-origin--card itinerary-card__content/);
  assert.match(origin, /<ItineraryCityVisual city=\{city\}/);
  assert.match(origin, /itinerary-origin__badge/);
  assert.match(css, /> \.itinerary-origin-section\s*\{[\s\S]*grid-column:\s*auto\s*!important;/s);
});

test('city visuals use official Tabler icons and no handmade SVG scenes', async () => {
  const visual = await read('src/modules/trips/ItineraryCityVisual.jsx');
  const header = await read('src/modules/trips/SegmentHeader.jsx');

  for (const cityKind of [
    'paris', 'amsterdam', 'bruges', 'ghent', 'brussels', 'cologne', 'berlin',
    'munich', 'nuremberg', 'bamberg', 'rothenburg', 'london', 'madrid',
  ]) {
    assert.match(visual, new RegExp(`'${cityKind}'`));
  }
  assert.match(visual, /from '@tabler\/icons-react'/);
  assert.match(visual, /IconBuildingBridge/);
  assert.match(visual, /IconBuildingCastle/);
  assert.match(visual, /IconBuildingMonument/);
  assert.match(visual, /IconBuildingSkyscraper/);
  assert.match(visual, /<VisualIcon/);
  assert.doesNotMatch(visual, /<path\b|<circle\b|<svg\b/i);
  assert.doesNotMatch(visual, /https?:\/\/|google.*photo|street.?view/i);
  assert.match(header, /<ItineraryCityVisual city=\{destination\} accent=\{sequenceColor\}/);
});

test('canonical destination number stays visible over every numbered card visual', async () => {
  const header = await read('src/modules/trips/SegmentHeader.jsx');
  const pane = await read('src/app/AppEditorPane.jsx');

  assert.match(pane, /sequenceNumber=\{stopSequence\[index\]\?\.number \?\? null\}/);
  assert.match(header, /const SEQUENCE_BADGE_STYLE = Object\.freeze\(\{[\s\S]*position: 'absolute',[\s\S]*top: '8px',[\s\S]*left: '8px',[\s\S]*display: 'grid'/s);
  assert.match(header, /className="itinerary-stop__sequence-badge"[\s\S]*style=\{sequenceBadgeStyle\}/s);
});

test('card content is isolated from the legacy compact row geometry', async () => {
  const header = await read('src/modules/trips/SegmentHeader.jsx');
  const origin = await read('src/modules/trips/ItineraryOrigin.jsx');
  const form = await read('src/modules/trips/SegmentForm.jsx');
  const css = await read('src/modules/trips/ItineraryCardLayoutFix.css');

  assert.match(header, /itinerary-card__content/);
  assert.match(header, /itinerary-card__footer/);
  assert.match(header, /itinerary-card__actions/);
  assert.match(header, /selectedDisplay="timeline"/);
  assert.match(origin, /selectedDisplay="timeline"/);
  assert.match(form, /import '\.\/ItineraryCardVisual\.css';\s*\nimport '\.\/ItineraryCardLayoutFix\.css';\s*\nimport '\.\/ItineraryCardRequestedPolish\.css';/);
  assert.match(css, /\.itinerary-card__place \.autocomplete__selected-value\s*\{[\s\S]*display:\s*none\s*!important;/s);
  assert.match(
    css,
    /> \.itinerary-segment\.segment,[\s\S]*> \.itinerary-origin-section\s*\{[\s\S]*height:\s*auto\s*!important;[\s\S]*max-height:\s*none\s*!important;/s
  );
  assert.match(
    css,
    /\.itinerary-card__content\s*\{[\s\S]*grid-template-areas:[\s\S]*'visual'[\s\S]*'place'[\s\S]*'footer'[\s\S]*height:\s*auto\s*!important;/s
  );
});

test('card dates use complete month names on a single line', async () => {
  const model = await read('src/modules/trips/segmentFormModel.js');
  const header = await read('src/modules/trips/SegmentHeader.jsx');
  const origin = await read('src/modules/trips/ItineraryOrigin.jsx');
  const polish = await read('src/modules/trips/ItineraryCardRequestedPolish.css');

  assert.match(model, /export function formatSegmentCardDate\(/);
  assert.match(model, /month:\s*'long'/);
  assert.match(model, /return `\$\{day\} \$\{capitalizedMonth\}`/);
  assert.match(model, /return `\$\{start\} - \$\{end\}`/);
  assert.match(header, /formatSegmentCardDateRange\(segment, locale\)/);
  assert.match(header, /\{formattedDateRange \|\| ''\}/);
  assert.doesNotMatch(header, /<span>\{formattedStartDate/);
  assert.match(origin, /\{formattedDepartureDate \|\| ''\}/);
  assert.match(polish, /itinerary-card__date\.itinerary-stop__date-range[\s\S]*white-space:\s*nowrap\s*!important;/s);
});

test('city, date and amount typography grows by two pixels in both card layouts', async () => {
  const polish = await read('src/modules/trips/ItineraryCardRequestedPolish.css');

  assert.match(polish, /\.itinerary-card__place \.input\s*\{[^}]*font-size:\s*15px\s*!important;/s);
  assert.match(polish, /itinerary-cards--grid[\s\S]*\.itinerary-card__place \.input\s*\{[^}]*font-size:\s*14px\s*!important;/s);
  assert.match(polish, /\.itinerary-card__date\.itinerary-stop__date-range\s*\{[^}]*font-size:\s*13px\s*!important;/s);
  assert.match(polish, /\.itinerary-card__amount\.itinerary-stop__amount\s*\{[^}]*font-size:\s*14px\s*!important;/s);
  assert.match(polish, /itinerary-cards--grid[\s\S]*\.itinerary-card__date\.itinerary-stop__date-range\s*\{[^}]*font-size:\s*12px\s*!important;/s);
  assert.match(polish, /itinerary-cards--grid[\s\S]*\.itinerary-card__amount\.itinerary-stop__amount\s*\{[^}]*font-size:\s*13px\s*!important;/s);
});

test('two-column cards reserve separate rows for full date, amount and actions', async () => {
  const layout = await read('src/modules/trips/ItineraryCardLayoutFix.css');
  const polish = await read('src/modules/trips/ItineraryCardRequestedPolish.css');

  assert.match(
    layout,
    /\.itinerary-cards\.itinerary-cards--grid[\s\S]*\.itinerary-card__footer\s*\{[\s\S]*grid-template-columns:\s*minmax\(0,\s*1fr\)\s*!important;[\s\S]*grid-template-rows:\s*auto 28px\s*!important;/s
  );
  assert.match(polish, /\.itinerary-card__metrics\s*\{[\s\S]*grid-template-rows:\s*auto auto\s*!important;/s);
  assert.match(layout, /\.itinerary-card__place \.input\s*\{[\s\S]*text-overflow:\s*ellipsis\s*!important;/s);
});

test('card actions are permanently visible and clickable', async () => {
  const polish = await read('src/modules/trips/ItineraryCardRequestedPolish.css');

  assert.match(
    polish,
    /\.itinerary-card__actions\s*\{[^}]*opacity:\s*1\s*!important;[^}]*visibility:\s*visible\s*!important;[^}]*pointer-events:\s*auto\s*!important;/s
  );
  assert.match(
    polish,
    /\.itinerary-card__actions \.itinerary-stop__remove-btn,[\s\S]*\.itinerary-card__actions \.itinerary-card__action\s*\{[^}]*opacity:\s*1\s*!important;[^}]*visibility:\s*visible\s*!important;[^}]*pointer-events:\s*auto\s*!important;/s
  );
});
