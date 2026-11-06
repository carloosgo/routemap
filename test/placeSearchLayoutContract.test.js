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

test('el buscador de escritorio conserva el shell compacto sin columnas fantasma', async () => {
  const routeMapCss = await read('src/modules/map/RouteMap.css');
  const form = await read('src/modules/map/PlaceSearchForm.jsx');

  assert.match(
    form,
    /<form className="geo-search" style=\{\{ maxWidth: '470px' \}\}/,
    'el buscador general debe conservar el ancho compacto máximo de 470 px'
  );
  assert.match(
    routeMapCss,
    /\.geo-search__row\{display:grid;grid-template-columns:minmax\(0,1fr\) auto;gap:6px\}/,
    'el row desktop debe contener sólo input y acción'
  );
  assert.doesNotMatch(
    routeMapCss,
    /\.geo-search__row::before/,
    'el buscador no debe recuperar el spacer fantasma de la izquierda'
  );
  assert.doesNotMatch(
    routeMapCss,
    /grid-template-columns:minmax\(0,82px\) minmax\(0,470px\) minmax\(0,82px\)/,
    'el layout no debe volver a reservar dos columnas laterales artificiales'
  );
  assert.doesNotMatch(
    routeMapCss,
    /\.geo-search__suggestions\{[^}]*width:min\(470px,calc\(100% - 176px\)\)[^}]*transform:translateX\(-50%\)/,
    'las sugerencias no deben centrarse con una geometría distinta de la del input'
  );
  assert.match(
    form,
    /<div className="geo-search__input-wrap">[\s\S]*?<div className="geo-search__suggestions"[\s\S]*?<\/div>\s*\)\}\s*<\/div>\s*<button type="submit" className="geo-search__button"/,
    'las sugerencias deben quedar ancladas al wrapper posicionado del input'
  );
});
