// test-contract: architecture
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const read = (path) => readFile(path, 'utf8');

test('la ciudad origen comparte la composición compacta de fecha, costo y acciones con los destinos', async () => {
  const [origin, header, originSection, compactCss] = await Promise.all([
    read('src/modules/trips/ItineraryOrigin.jsx'),
    read('src/modules/trips/SegmentHeader.jsx'),
    read('src/modules/trips/SegmentOriginSection.jsx'),
    read('src/modules/trips/ItineraryCompactList.css'),
  ]);

  assert.match(originSection, /formatSegmentCardDate\(\s*originDetails\?\.departureDate,\s*locale\s*\)/);
  assert.match(originSection, /formattedDepartureDate=\{formattedDepartureDate\}/);
  assert.match(origin, /itinerary-origin itinerary-origin--card itinerary-card__content/);
  assert.match(origin, /className="itinerary-card__date itinerary-stop__date-range"/);
  assert.match(origin, /\{formattedDepartureDate \|\| ''\}/);
  assert.doesNotMatch(origin, /formattedEndDate|endDate/);
  assert.match(origin, /className="itinerary-card__amount itinerary-stop__amount"/);
  assert.match(origin, /className="itinerary-card__actions"/);
  assert.match(header, /className="segment__header itinerary-stop itinerary-card__content"/);
  assert.match(header, /className="itinerary-card__date itinerary-stop__date-range"/);
  assert.match(header, /className="itinerary-card__amount itinerary-stop__amount"/);
  assert.match(header, /className="itinerary-card__actions"/);

  assert.doesNotMatch(origin, /itinerary-card__footer|itinerary-card__metrics/);
  assert.doesNotMatch(header, /itinerary-card__footer|itinerary-card__metrics/);
  assert.match(compactCss, /grid-template-areas:[\s\S]*'visual place amount'[\s\S]*'visual date actions'/s);
  assert.match(compactCss, /\.itinerary-card__actions\s*\{[\s\S]*justify-content:\s*center\s*!important;/s);
});

test('la ayuda de ciudad origen es breve y localizada para una app de viajes', async () => {
  const [esSource, enSource] = await Promise.all([
    read('src/i18n/es.js'),
    read('src/i18n/en.js'),
  ]);

  assert.match(esSource, /originPlaceholder: 'Ciudad origen'/);
  assert.match(enSource, /originPlaceholder: 'Origin city'/);
});
