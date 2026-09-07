// test-contract: architecture
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const root = new URL('../', import.meta.url);
const read = (path) => readFile(new URL(path, root), 'utf8');

test('el buscador de lugares permanece centrado en la columna real del mapa', async () => {
  const routeMapCss = await read('src/modules/map/RouteMap.css');
  const workspaceCss = await read('src/app/FloatingItineraryPanel.css');

  assert.match(
    routeMapCss,
    /\.geo-search\{[^}]*left:50%;[^}]*transform:translateX\(-50%\)/,
    'RouteMap debe definir el buscador respecto al centro de su propio contenedor'
  );

  assert.match(
    workspaceCss,
    /\.workspace__desktop--column\s*>\s*\.mappane\s+\.geo-search\s*\{[^}]*left:\s*50%;[^}]*transform:\s*translateX\(-50%\);?[^}]*\}/s,
    'la hoja tardía del workspace debe preservar el centro real del mappane'
  );

  assert.doesNotMatch(
    workspaceCss,
    /\.geo-search\s*\{[^}]*left:\s*14px/s,
    'ninguna regla del workspace puede volver a fijar el buscador al gutter izquierdo'
  );
});
