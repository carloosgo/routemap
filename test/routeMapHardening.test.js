import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const routeMapPath = new globalThis.URL('../src/modules/map/RouteMap.jsx', import.meta.url);

async function source() {
  return readFile(routeMapPath, 'utf8');
}

test('RouteMap no inyecta HTML para mostrar errores de configuración', async () => {
  const content = await source();
  assert.doesNotMatch(content, /\.innerHTML\s*=/);
  assert.match(content, /geo-map__missing/);
});

test('RouteMap vuelve a dibujar tramos cuando cambia su orden', async () => {
  const content = await source();
  assert.match(content, /segments\.forEach\(\(segment, index\)/);
  assert.match(content, /colorForIndex\(index\)/);
  assert.match(content, /\[segments, mapReady\]/);
});

test('RouteMap conserva las curvas adaptativas y solo puntea vuelos', async () => {
  const content = await source();
  assert.match(content, /function adaptiveCurve/);
  assert.match(content, /dominantTransport\(segment\) === 'plane'/);
  assert.match(content, /filter:\s*\['==', \['get', 'dashed'\], true\]/);
  assert.match(content, /'line-dasharray':\s*\[5, 4\]/);
});

test('RouteMap pinta solo las ciudades definidas por los tramos', async () => {
  const content = await source();
  assert.match(content, /function orderedCities/);
  assert.match(content, /\[segment\.origin, segment\.destination\]/);
  assert.match(content, /orderedCities\(segments\)\.forEach/);
  assert.match(content, /'circle-color':\s*\['get', 'color'\]/);
});

test('RouteMap no calcula ni persiste rutas mediante Geoapify', async () => {
  const content = await source();
  assert.doesNotMatch(content, /requestGeoapifyRoute|routeMode|geo-routes|Trazar ruta/);
  assert.match(content, /searchGeoapifyPlaces/);
});
