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
  assert.match(content, /t\('mapConfigMissing'\)/);
});

test('RouteMap vuelve a dibujar rutas cuando cambia el orden de segmentos', async () => {
  const content = await source();
  assert.match(content, /drawRoutes\(map, markersRef, segments\)/);
  assert.match(content, /\[segments\]/);
});
