// test-contract: architecture
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const root = new URL('../../', import.meta.url);
const read = (path) => readFile(new URL(path, root), 'utf8');

test('itinerary map preserves viewport after first projection and reconciles markers in place', async () => {
  const source = await read('src/modules/map/GooglePlacesMap.jsx');

  assert.match(source, /itineraryMarkersByKeyRef\s*=\s*useRef\(new Map\(\)\)/);
  assert.match(source, /const existing = itineraryMarkersByKeyRef\.current\.get\(markerKey\)/);
  assert.match(source, /updateItineraryCityContent\([\s\S]*existing\.content[\s\S]*existing\.marker\.position = markerPosition[\s\S]*existing\.marker\.title = markerTitle[\s\S]*existing\.marker\.zIndex = markerZIndex/s);
  assert.match(source, /itineraryMarkersByKeyRef\.current\.set\(markerKey, \{ marker, content \}\)/);
  assert.doesNotMatch(source, /itineraryMarkersRef/);

  assert.match(source, /const firstItineraryProjection = lastItineraryViewportKeyRef\.current === null;/);
  assert.match(source, /if \(firstItineraryProjection && routeCities\.length > 0\)/);
  assert.doesNotMatch(source, /const viewportChanged/);
  assert.match(source, /agregar, eliminar o[\s\S]*reordenar ciudades nunca vuelve a ejecutar movimientos automáticos de cámara/s);

  const cleanup = source.match(/return \(\) => \{\s*viewportIdleListener\?\.remove\?\.\(\);[\s\S]*?No desmontar aquí trazos, landmarks ni marcadores[\s\S]*?\};/s)?.[0] || '';
  assert.ok(cleanup, 'el efecto de itinerario debe conservar sus nodos entre proyecciones');
  assert.doesNotMatch(cleanup, /clearItineraryMarkers|setRoutes\(\[\]\)|setLandmarks\(\[\]\)/);
});
