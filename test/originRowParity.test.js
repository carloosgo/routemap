import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const read = (path) => readFile(path, 'utf8');

test('la ciudad origen comparte la retícula de fecha, costo y acciones de los trayectos', async () => {
  const [origin, originSection, compactCss] = await Promise.all([
    read('src/modules/trips/ItineraryOrigin.jsx'),
    read('src/modules/trips/SegmentOriginSection.jsx'),
    read('src/modules/trips/ItineraryCompactTen.css'),
  ]);

  assert.match(originSection, /formatSegmentDate\(\s*originDetails\?\.departureDate,\s*locale\s*\)/);
  assert.match(originSection, /formattedDepartureDate=\{formattedDepartureDate\}/);
  assert.match(origin, /className="itinerary-stop__date-range"/);
  assert.match(origin, /\{formattedDepartureDate \|\| ''\}/);
  assert.doesNotMatch(origin, /formattedEndDate|endDate/);

  assert.match(
    compactCss,
    /\.editor-module\.editor-module--itinerary \.itinerary-stop__after-place,\s*\.segments:not\(\.segments--compact\) \.itinerary-origin__after-place[\s\S]*?grid-template-columns: minmax\(56px, 1fr\) 90px repeat\(3, 14px\)/
  );
  assert.match(
    compactCss,
    /\.editor-module\.editor-module--itinerary \.itinerary-stop__metrics,\s*\.segments:not\(\.segments--compact\) \.itinerary-origin__metrics\s*\{\s*display: contents;/
  );
  assert.doesNotMatch(compactCss, /\.itinerary-origin__after-place\s*\{\s*width: max-content;/);
});

test('la ayuda de ciudad origen es breve y localizada para una app de viajes', async () => {
  const [esSource, enSource] = await Promise.all([
    read('src/i18n/es.js'),
    read('src/i18n/en.js'),
  ]);

  assert.match(esSource, /originPlaceholder: 'Ciudad origen'/);
  assert.match(enSource, /originPlaceholder: 'Origin city'/);
});
