import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const root = new URL('../', import.meta.url);

async function read(relativePath) {
  return readFile(new URL(relativePath, root), 'utf8');
}

test('Itinerario renderiza los guiones como SVG sincronizado con OverlayView.draw', async () => {
  const googleMap = await read('src/modules/map/GooglePlacesMap.jsx');
  const renderer = await read('src/modules/map/crispDashedRoutes.js');

  assert.match(googleMap, /createCrispDashedRoutes\(/);
  assert.match(renderer, /DEFAULT_DASH_PX = 4/);
  assert.match(renderer, /DEFAULT_GAP_PX = 6/);
  assert.match(renderer, /DEFAULT_STROKE_WEIGHT = 2/);
  assert.match(renderer, /new maps\.OverlayView\(\)/);
  assert.match(renderer, /overlay\.draw = \(\) =>/);
  assert.match(renderer, /fromLatLngToDivPixel/);
  assert.match(renderer, /stroke-dasharray/);
  assert.match(renderer, /vector-effect/);
  assert.match(renderer, /shape-rendering/);
  assert.match(renderer, /overlayLayer/);
  assert.doesNotMatch(renderer, /fromDivPixelToLatLng/);
  assert.doesNotMatch(renderer, /new maps\.Polyline/);
  assert.doesNotMatch(renderer, /setTimeout|ResizeObserver|tilesloaded|zoom_changed/);
});

test('el trazado del itinerario se actualiza sin desmontar el overlay ni esperar a idle', async () => {
  const googleMap = await read('src/modules/map/GooglePlacesMap.jsx');
  const renderer = await read('src/modules/map/crispDashedRoutes.js');

  assert.match(renderer, /setRoutes\(nextRoutes\)/);
  assert.match(renderer, /refresh\(\)/);
  assert.match(googleMap, /itineraryRoutesOverlayRef/);
  assert.match(googleMap, /routeOverlay\.setRoutes\(routes\)/);
  assert.match(googleMap, /itineraryRoutesOverlayRef\.current\?\.refresh\(\)/);
  assert.doesNotMatch(googleMap, /refreshLikeViewChangeAndMountRoutes/);
  assert.doesNotMatch(googleMap, /crispRoutes\.dispose\(\)/);
});
