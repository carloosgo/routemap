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
});

test('si no existe imagen se usa un icono alusivo, nunca una inicial', async () => {
  const content = await source();
  assert.match(content, /export function representativePlaceIcon/);
  assert.match(content, /🏛️/);
  assert.match(content, /🍽️/);
  assert.match(content, /📍/);
  assert.doesNotMatch(content, /charAt\(0\)\.toUpperCase/);
});

test('guardar un lugar normaliza todos sus datos y evita doble guardado', async () => {
  const content = await source();
  assert.match(content, /event\.stopPropagation\(\)/);
  assert.match(content, /alreadySaved/);
  assert.match(content, /lat: Number\(selected\.lat\)/);
  assert.match(content, /lon: Number\(selected\.lon\)/);
  assert.match(content, /button\.textContent = 'Guardado'/);
  assert.match(content, /addPlaceRef\.current\?\.\(savedPlace\)/);
});

test('la búsqueda contextual usa la ciudad más reciente de la ruta', async () => {
  const content = await source();
  assert.match(content, /export function placeSearchContext/);
  assert.match(content, /\.reverse\(\)/);
  assert.match(content, /\[segment\.destination, segment\.origin\]/);
  assert.match(content, /knownLocations/);
  assert.match(content, /context: searchContext/);
});

test('los resultados solo cambian al enviar el formulario de búsqueda', async () => {
  const content = await source();
  assert.match(content, /async function submitSearch/);
  assert.match(content, /<form className="geo-search" onSubmit=\{submitSearch\}>/);
  assert.match(content, /type="submit"/);
  assert.match(content, /setResults\(nextResults\)/);
  const autocompleteBlock = content.slice(content.indexOf('autocompleteAbortRef.current?.abort()'), content.indexOf('async function submitSearch'));
  assert.doesNotMatch(autocompleteBlock, /setResults\(/);
});

test('el autocompletado permanece activo pero separado de los resultados del mapa', async () => {
  const content = await source();
  assert.match(content, /setSuggestions\(nextSuggestions\)/);
  assert.match(content, /geo-search__suggestions/);
  assert.match(content, /chooseSuggestion/);
  assert.match(content, /setShowSuggestions\(false\)/);
});

test('respuestas antiguas no reemplazan búsquedas o sugerencias nuevas', async () => {
  const content = await source();
  assert.match(content, /searchSequenceRef/);
  assert.match(content, /autocompleteSequenceRef/);
  assert.match(content, /sequence === searchSequenceRef\.current/);
  assert.match(content, /sequence === autocompleteSequenceRef\.current/);
  assert.match(content, /searchAbortRef\.current\?\.abort\(\)/);
  assert.match(content, /autocompleteAbortRef\.current\?\.abort\(\)/);
  assert.match(content, /clearTimeout\(timer\)/);
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
