import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { adaptiveCurve } from '../src/modules/map/routeMapModel.js';

const root = new URL('../', import.meta.url);

async function read(relativePath) {
  return readFile(new URL(relativePath, root), 'utf8');
}

test('las curvas del itinerario mantienen una densidad acotada para pan y zoom fluidos', () => {
  const curve = adaptiveCurve(
    { lat: 48.8566, lon: 2.3522 },
    { lat: 52.52, lon: 13.405 }
  );

  assert.equal(curve.length, 33);
  assert.deepEqual(curve[0], [2.3522, 48.8566]);
  assert.deepEqual(curve[curve.length - 1], [13.405, 52.52]);
});

test('las rutas del itinerario delegan pan y zoom a Polyline y evitan redraw por frame', async () => {
  const source = await read('src/modules/map/crispDashedRoutes.js');

  assert.match(source, /new maps\.Polyline/);
  assert.match(source, /existing\.setPath\(path\)/);
  assert.match(source, /routePolylines\.pop\(\)\?\.setMap\(null\)/);
  assert.doesNotMatch(source, /new maps\.OverlayView|requestAnimationFrame|cancelAnimationFrame|MutationObserver/);
  assert.doesNotMatch(source, /createRouteMask|maskUnits|maskContentUnits|200000|100000/);
});

test('cambiar idioma no destruye ni reinicializa la instancia de Google Maps', async () => {
  const source = await read('src/modules/map/GooglePlacesMap.jsx');

  assert.match(source, /setLoadErrorKey\('googleMapLoadError'\)/);
  assert.match(source, /\}, \[mapConfigured\]\);/);
  assert.doesNotMatch(source, /\[mapConfigured,\s*t\]/);
  assert.match(source, /loadErrorKey && <div className="geo-map__missing">\{t\(loadErrorKey\)\}<\/div>/);
});
