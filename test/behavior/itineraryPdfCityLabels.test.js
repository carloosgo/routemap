// test-contract: behavior
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const composerSource = readFileSync(
  resolve('src/modules/export/itineraryStaticMapComposer.js'),
  'utf8'
);
const pdfSource = readFileSync(
  resolve('src/modules/export/itineraryPdfHybrid.js'),
  'utf8'
);

test('el mapa PDF usa etiquetas de ciudad, marcadores compactos y no colorea países', () => {
  assert.match(composerSource, /const MARKER_RADIUS = 6\.35/);
  assert.match(composerSource, /function drawCityLabel/);
  assert.match(composerSource, /ctx\.fillText\(cityName/);
  assert.match(composerSource, /const LABEL_HEIGHT = 18/);
  assert.match(composerSource, /const ATTRIBUTION_GUARD = 27/);
  assert.doesNotMatch(composerSource, /loadWorldAtlasCountries/);
  assert.doesNotMatch(composerSource, /drawCountryTint/);
  assert.doesNotMatch(composerSource, /findCountryContainingPoint/);
});

test('las etiquetas cercanas prueban varias posiciones, evitan marcadores y usan guía al alejarse', () => {
  assert.match(composerSource, /const LABEL_DISTANCE_STEPS = \[7, 15, 26, 38, 52\]/);
  assert.match(composerSource, /function intersectionArea/);
  assert.match(composerSource, /function scoreLabelCandidate/);
  assert.match(composerSource, /const markerObstacles = geometries\.map/);
  assert.match(composerSource, /nearestNeighborDistance/);
  assert.match(composerSource, /function drawLeaderLine/);
  assert.match(composerSource, /placement\.distance < LEADER_MIN_DISTANCE/);
});

test('las etiquetas respetan el corredor de la ruta para no tapar el trazo punteado', () => {
  assert.match(composerSource, /const ROUTE_LABEL_GAP = 3/);
  assert.match(composerSource, /function projectedRouteSegments/);
  assert.match(composerSource, /function segmentIntersectsBox/);
  assert.match(composerSource, /const routeCollisions = routeSegments\.reduce/);
  assert.match(composerSource, /routeCollisions \* 1_000_000/);
  assert.match(composerSource, /const routeSegments = projectedRouteSegments\(entries, viewport, scale\)/);
  assert.match(composerSource, /markerObstacles,\n\s+routeSegments/);
});

test('las cards conservan un espacio moderado sólo entre párrafos explícitos', () => {
  assert.match(pdfSource, /function noteBodyLines/);
  assert.match(pdfSource, /let pendingParagraphGap = false/);
  assert.match(pdfSource, /if \(pendingParagraphGap && lines\.length/);
  assert.match(pdfSource, /const lineHeight = 9\.25/);
  assert.match(pdfSource, /const paragraphGap = 4\.25/);
  assert.match(pdfSource, /y \+= layout\.paragraphGap/);
});
