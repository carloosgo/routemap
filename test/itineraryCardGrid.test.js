// test-contract: behavior
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const root = new URL('../', import.meta.url);
const read = (path) => readFile(new URL(path, root), 'utf8');

test('itinerary defaults to one card per row and offers a two-column grid', async () => {
  const pane = await read('src/app/AppEditorPane.jsx');
  const css = await read('src/modules/trips/ItineraryCardVisual.css');

  assert.match(pane, /useState\('list'\)/);
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

test('city visuals are local and representative for known itinerary cities', async () => {
  const visual = await read('src/modules/trips/ItineraryCityVisual.jsx');
  const header = await read('src/modules/trips/SegmentHeader.jsx');

  for (const cityKind of [
    'paris', 'amsterdam', 'bruges', 'ghent', 'brussels', 'cologne', 'berlin',
    'munich', 'nuremberg', 'bamberg', 'rothenburg', 'london', 'madrid',
  ]) {
    assert.match(visual, new RegExp(`'${cityKind}'`));
  }
  assert.match(header, /<ItineraryCityVisual city=\{destination\} accent=\{sequenceColor\}/);
  assert.doesNotMatch(visual, /https?:\/\/|google.*photo|street.?view/i);
});

test('card content is isolated from the legacy compact row geometry', async () => {
  const header = await read('src/modules/trips/SegmentHeader.jsx');
  const origin = await read('src/modules/trips/ItineraryOrigin.jsx');
  const form = await read('src/modules/trips/SegmentForm.jsx');
  const css = await read('src/modules/trips/ItineraryCardLayoutFix.css');

  assert.match(header, /itinerary-card__content/);
  assert.match(header, /itinerary-card__footer/);
  assert.match(header, /itinerary-card__actions/);
  assert.match(header, /selectedDisplay="full"/);
  assert.doesNotMatch(header, /selectedDisplay="timeline"/);
  assert.match(origin, /selectedDisplay="full"/);
  assert.doesNotMatch(origin, /selectedDisplay="timeline"/);
  assert.match(form, /import '\.\/ItineraryCardVisual\.css';\s*\nimport '\.\/ItineraryCardLayoutFix\.css';/);
  assert.match(
    css,
    /> \.itinerary-segment\.segment,[\s\S]*> \.itinerary-origin-section\s*\{[\s\S]*height:\s*auto\s*!important;[\s\S]*max-height:\s*none\s*!important;/s
  );
  assert.match(
    css,
    /\.itinerary-card__content\s*\{[\s\S]*grid-template-areas:[\s\S]*'visual'[\s\S]*'place'[\s\S]*'footer'[\s\S]*height:\s*auto\s*!important;/s
  );
});

test('two-column cards reserve separate footer space for metrics and actions', async () => {
  const css = await read('src/modules/trips/ItineraryCardLayoutFix.css');

  assert.match(
    css,
    /\.itinerary-cards\.itinerary-cards--grid[\s\S]*\.itinerary-card__footer\s*\{[\s\S]*grid-template-columns:\s*minmax\(0,\s*1fr\)\s*!important;[\s\S]*grid-template-rows:\s*auto 28px\s*!important;/s
  );
  assert.match(css, /\.itinerary-card__metrics\s*\{[\s\S]*justify-content:\s*space-between\s*!important;/s);
  assert.match(css, /\.itinerary-card__place \.input\s*\{[\s\S]*text-overflow:\s*ellipsis\s*!important;/s);
});

test('card actions stay quiet until hover or keyboard focus on fine pointers', async () => {
  const css = await read('src/modules/trips/ItineraryCardLayoutFix.css');

  assert.match(css, /@media \(min-width:\s*721px\) and \(hover:\s*hover\) and \(pointer:\s*fine\)/);
  assert.match(
    css,
    /\.itinerary-card__actions\s*\{[\s\S]*opacity:\s*0;[\s\S]*visibility:\s*hidden;[\s\S]*pointer-events:\s*none;/s
  );
  assert.match(css, /\.itinerary-segment:hover \.itinerary-card__actions/);
  assert.match(css, /\.itinerary-origin:hover \.itinerary-card__actions/);
  assert.match(css, /\.itinerary-segment:focus-within \.itinerary-card__actions/);
  assert.match(css, /\.itinerary-origin:focus-within \.itinerary-card__actions/);
});
