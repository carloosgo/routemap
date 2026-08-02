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
  assert.match(content, /\[segments\]/);
});

test('RouteMap conserva las curvas adaptativas y solo puntea vuelos', async () => {
  const content = await source();
  assert.match(content, /function adaptiveCurve/);
  assert.match(content, /dominantTransport\(segment\) === 'plane'/);
  assert.match(content, /dashArray: dashed \? '10 8' : null/);
});

test('RouteMap pinta las ciudades con el color del tramo', async () => {
  const content = await source();
  assert.match(content, /cityColors\.set\(key, \{ city, color \}\)/);
  assert.match(content, /fillColor: color/);
});

test('RouteMap no calcula ni persiste rutas mediante Geoapify', async () => {
  const content = await source();
  assert.doesNotMatch(content, /requestGeoapifyRoute|routeMode|geo-routes|Trazar ruta/);
  assert.match(content, /searchGeoapifyPlaces/);
});
