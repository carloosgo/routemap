import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const root = new globalThis.URL('../', import.meta.url);
async function read(path) { return readFile(new URL(path, root), 'utf8'); }
async function source() { return read('src/modules/map/RouteMap.jsx'); }

test('RouteMap muestra de forma declarativa los errores de configuración', async () => {
  const content = await source();
  assert.match(content, /geo-map__missing/);
  assert.match(content, /Falta VITE_GEOAPIFY_MAPS_API_KEY/);
});

test('RouteMap vuelve a dibujar tramos y lugares cuando cambia el viaje', async () => {
  const content = await source();
  assert.match(content, /segments\.forEach\(\(segment, index\)/);
  assert.match(content, /colorForIndex\(index\)/);
  assert.match(content, /\[segments, places, mapReady\]/);
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

test('los resultados de lugares se muestran como pestañas DOM, no como puntos', async () => {
  const content = await source();
  assert.match(content, /function markerElement/);
  assert.match(content, /place-result-marker/);
  assert.match(content, /new maplibregl\.Marker/);
  assert.match(content, /anchor: 'bottom'/);
  assert.doesNotMatch(content, /RESULT_LAYER_ID|atlas-search-results-layer/);
});

test('cada pestaña muestra nombre, ciudad, país e intenta cargar imagen real', async () => {
  const content = await source();
  assert.match(content, /place\.name/);
  assert.match(content, /\[place\.city, place\.country \|\| place\.countryCode\]/);
  assert.match(content, /fetchGeoapifyPlaceImage/);
  assert.match(content, /image\.classList\.add\('is-loaded'\)/);
  assert.match(content, /Guardar en mi ruta/);
});

test('la búsqueda contextual usa la ciudad más reciente de la ruta', async () => {
  const content = await source();
  assert.match(content, /export function placeSearchContext/);
  assert.match(content, /\.reverse\(\)/);
  assert.match(content, /\[segment\.destination, segment\.origin\]/);
  assert.match(content, /knownLocations/);
  assert.match(content, /context: searchContext/);
});

test('editar rápidamente la búsqueda no permite que una respuesta vieja reemplace la nueva', async () => {
  const content = await source();
  assert.match(content, /searchSequenceRef/);
  assert.match(content, /sequence === searchSequenceRef\.current/);
  assert.match(content, /abortRef\.current\?\.abort\(\)/);
  assert.match(content, /clearTimeout\(timer\)/);
});

test('una edición válida conserva los resultados anteriores mientras llega la siguiente respuesta', async () => {
  const content = await source();
  const validStart = content.indexOf('abortRef.current = controller;');
  const validEnd = content.indexOf('const timer = setTimeout', validStart);
  assert.ok(validStart >= 0 && validEnd > validStart);
  assert.doesNotMatch(content.slice(validStart, validEnd), /setResults\(\[\]\)/);
  assert.match(content, /text\.length < config\.geoapify\.searchMinChars[\s\S]*setResults\(\[\]\)/);
});

test('RouteMap elimina marcadores y solicitudes de imágenes al actualizar o desmontar', async () => {
  const content = await source();
  assert.match(content, /resultMarkersRef\.current\.forEach/);
  assert.match(content, /controller\.abort\(\)/);
  assert.match(content, /marker\.remove\(\)/);
});

test('RouteMap no calcula ni persiste rutas mediante Geoapify', async () => {
  const content = await source();
  assert.doesNotMatch(content, /requestGeoapifyRoute|routeMode|geo-routes|Trazar ruta/);
  assert.match(content, /searchGeoapifyPlaces/);
});
