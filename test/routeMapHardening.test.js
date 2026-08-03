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
  assert.match(content, /segments\.forEach\(\(segment,index\)/);
  assert.match(content, /colorForIndex\(index\)/);
  assert.match(content, /\[segments,places,mapReady\]/);
});

test('RouteMap conserva las curvas adaptativas y solo puntea vuelos', async () => {
  const content = await source();
  assert.match(content, /function adaptiveCurve/);
  assert.match(content, /dominantTransport\(segment\)==='plane'/);
  assert.match(content, /filter:\['==',\['get','dashed'\],true\]/);
  assert.match(content, /'line-dasharray':\[5,4\]/);
});

test('RouteMap pinta solo las ciudades definidas por los tramos', async () => {
  const content = await source();
  assert.match(content, /function orderedCities/);
  assert.match(content, /\[segment\.origin,segment\.destination\]/);
  assert.match(content, /orderedCities\(segments\)\.forEach/);
  assert.match(content, /'circle-color':\['get','color'\]/);
});

test('los resultados se muestran como pestañas DOM, no como puntos', async () => {
  const content = await source();
  assert.match(content, /function markerElement/);
  assert.match(content, /place-result-marker/);
  assert.match(content, /new maplibregl\.Marker/);
  assert.match(content, /anchor:'bottom'/);
  assert.doesNotMatch(content, /RESULT_LAYER_ID|atlas-search-results-layer/);
});

test('la pestaña intenta cargar imagen y solo la muestra después de load', async () => {
  const content = await source();
  assert.match(content, /fetchGeoapifyPlaceImage/);
  assert.match(content, /addEventListener\('load'/);
  assert.match(content, /classList\.add\('is-loaded'\)/);
  assert.match(content, /addEventListener\('error'/);
  assert.match(content, /removeAttribute\('src'\)/);
});

test('si no existe imagen se usa un icono alusivo, nunca una inicial', async () => {
  const content = await source();
  assert.match(content, /export function representativePlaceIcon/);
  assert.match(content, /🏛️/);
  assert.match(content, /🍽️/);
  assert.match(content, /📍/);
  assert.doesNotMatch(content, /charAt\(0\)\.toUpperCase/);
});

test('la confirmación se mantiene unida al marcador seleccionado', async () => {
  const content = await source();
  assert.match(content, /function savePrompt/);
  assert.match(content, /¿Guardar lugar para tu ruta\?/);
  assert.match(content, /className:'place-save-popup'/);
  assert.match(content, /anchor:'bottom'/);
  assert.match(content, /offset:\[0,-58\]/);
  assert.match(content, /focusAfterOpen:false/);
  assert.doesNotMatch(content, /Guardar en mi ruta/);
});

test('guardar normaliza el lugar, valida coordenadas y cierra la confirmación', async () => {
  const content = await source();
  assert.match(content, /event\.stopPropagation\(\)/);
  assert.match(content, /alreadySaved/);
  assert.match(content, /lat:Number\(selected\.lat\)/);
  assert.match(content, /lon:Number\(selected\.lon\)/);
  assert.match(content, /isPlaced\(savedPlace\)/);
  assert.match(content, /addPlaceRef\.current\?\.\(savedPlace\)/);
  assert.match(content, /onClose:\(\)=>popup\.remove\(\)/);
});

test('el formulario conserva la búsqueda explícita y sus validaciones', async () => {
  const content = await source();
  assert.match(content, /async function submitSearch/);
  assert.match(content, /<form className="geo-search" onSubmit=\{submitSearch\}>/);
  assert.match(content, /type="submit"/);
  assert.match(content, /text\.length<config\.geoapify\.searchMinChars/);
  assert.match(content, /setResults\(next\)/);
});

test('elegir una sugerencia la selecciona, centra y abre sin una segunda búsqueda', async () => {
  const content = await source();
  assert.match(content, /function chooseSuggestion\(place\)\{if\(!isPlaced\(place\)\)return/);
  assert.match(content, /pendingSelectionRef\.current=String\(place\.id\)/);
  assert.match(content, /skipAutocompleteRef\.current=true/);
  assert.match(content, /setResults\(\[place\]\)/);
  assert.match(content, /if\(pendingPlace\)\{pendingSelectionRef\.current=null;openPlace\(pendingPlace\);\}/);
  assert.match(content, /map\.easeTo\(\{center:\[place\.lon,place\.lat\],zoom:Math\.max\(map\.getZoom\(\),15\),duration:350\}\)/);
});

test('seleccionar una sugerencia no dispara otra petición de autocompletado', async () => {
  const content = await source();
  assert.match(content, /skipAutocompleteRef/);
  assert.match(content, /if\(skipAutocompleteRef\.current\)\{skipAutocompleteRef\.current=false/);
  const chooseBlock = content.slice(content.indexOf('function chooseSuggestion'), content.indexOf('function handleQueryChange'));
  assert.doesNotMatch(chooseBlock, /searchGeoapifyPlaces/);
  assert.match(chooseBlock, /autocompleteAbortRef\.current\?\.abort\(\)/);
  assert.match(chooseBlock, /searchAbortRef\.current\?\.abort\(\)/);
});

test('limpiar o editar la consulta apaga inmediatamente el estado de sugerencias', async () => {
  const content = await source();
  assert.match(content, /function handleQueryChange/);
  assert.match(content, /setSuggesting\(false\)/);
  assert.match(content, /autocompleteSequenceRef\.current\+=1/);
  assert.match(content, /setSuggestions\(\[\]\)/);
  assert.match(content, /query\.trim\(\)\.length>=config\.geoapify\.searchMinChars/);
});

test('respuestas antiguas no reemplazan búsquedas o sugerencias nuevas', async () => {
  const content = await source();
  assert.match(content, /searchSequenceRef/);
  assert.match(content, /autocompleteSequenceRef/);
  assert.match(content, /sequence===searchSequenceRef\.current/);
  assert.match(content, /sequence===autocompleteSequenceRef\.current/);
  assert.match(content, /searchAbortRef\.current\?\.abort\(\)/);
  assert.match(content, /autocompleteAbortRef\.current\?\.abort\(\)/);
  assert.match(content, /clearTimeout\(timer\)/);
});

test('RouteMap elimina marcadores, popups y solicitudes al actualizar o desmontar', async () => {
  const content = await source();
  assert.match(content, /resultMarkersRef\.current\.forEach/);
  assert.match(content, /activePromptRef\.current\?\.remove\(\)/);
  assert.match(content, /controller\.abort\(\)/);
  assert.match(content, /marker\.remove\(\)/);
});

test('RouteMap no calcula ni persiste rutas mediante Geoapify', async () => {
  const content = await source();
  assert.doesNotMatch(content, /requestGeoapifyRoute|routeMode|geo-routes|Trazar ruta/);
  assert.match(content, /searchGeoapifyPlaces/);
});
