// test-contract: architecture
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const read = (path) => readFile(path, 'utf8');

test('la ciudad origen comparte la composición de fecha, costo y acciones de las cards de destino', async () => {
  const [origin, header, originSection, cardCss] = await Promise.all([
    read('src/modules/trips/ItineraryOrigin.jsx'),
    read('src/modules/trips/SegmentHeader.jsx'),
    read('src/modules/trips/SegmentOriginSection.jsx'),
    read('src/modules/trips/ItineraryCardLayoutFix.css'),
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

  assert.match(
    cardCss,
    /\.itinerary-card__content\s*\{[\s\S]*grid-template-areas:[\s\S]*'visual'[\s\S]*'place'[\s\S]*'footer'/s
  );
  assert.match(
    cardCss,
    /\.itinerary-card__footer\s*\{[\s\S]*grid-template-columns:\s*minmax\(0,\s*1fr\) auto\s*!important;/s
  );
  assert.match(cardCss, /\.itinerary-card__metrics\s*\{[\s\S]*justify-content:\s*space-between\s*!important;/s);
  assert.doesNotMatch(cardCss, /\.itinerary-origin__after-place\s*\{\s*width:\s*max-content;/);
});

test('la ayuda de ciudad origen es breve y localizada para una app de viajes', async () => {
  const [esSource, enSource] = await Promise.all([
    read('src/i18n/es.js'),
    read('src/i18n/en.js'),
  ]);

  assert.match(esSource, /originPlaceholder: 'Ciudad origen'/);
  assert.match(enSource, /originPlaceholder: 'Origin city'/);
});
