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

test('el overlay SVG evita máscaras gigantes y limita draw a un frame de navegador', async () => {
  const source = await read('src/modules/map/crispDashedRoutes.js');

  assert.match(source, /normalizedLatLngPath/);
  assert.match(source, /requestAnimationFrame\(render\)/);
  assert.match(source, /if \(disposed \|\| drawFrame\) return/);
  assert.doesNotMatch(source, /createRouteMask|maskUnits|maskContentUnits|200000|100000/);
});
