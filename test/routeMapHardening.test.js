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

test('RouteMap vuelve a dibujar las capas cuando cambia el viaje o la vista', async () => {
  const content = await source();
  assert.match(content, /segments\.forEach\(\(segment, index\)/);
  assert.match(content, /colorForIndex\(index\)/);
  assert.match(content, /\[segments, places, viewMode, mapReady\]/);
});

test('RouteMap conserva las curvas visuales adaptativas y solo puntea vuelos', async () => {
  const content = await source();
  assert.match(content, /function adaptiveCurve/);
  assert.match(content, /dominantTransport\(segment\) === 'plane'/);
  assert.match(content, /coordinates: adaptiveCurve\(segment\.origin, segment\.destination\)/);
  assert.match(content, /filter: \['==', \['get', 'dashed'\], true\]/);
  assert.match(content, /'line-dasharray': \[5, 4\]/);
});

test('Tramos y Lugares son capas independientes y mutuamente excluyentes', async () => {
  const content = await source();
  const app = await read('src/App.jsx');
  const pane = await read('src/app/AppMapPane.jsx');

  assert.match(content, /viewMode = 'segments'/);
  assert.match(content, /const showSegments = viewMode === 'segments'/);
  assert.match(content, /const showPlaces = viewMode === 'places'/);
  assert.match(content, /const routeCities = showSegments \? orderedCities\(segments\) : \[\]/);
  assert.match(content, /if \(showSegments\) \{[\s\S]*segments\.forEach/);
  assert.match(content, /if \(showPlaces\) \{[\s\S]*places\.filter\(isPlaced\)\.forEach/);
  assert.match(content, /viewMode === 'places' && \([\s\S]*<form className="geo-search"/);
  assert.match(app, /mapView=\{activeTab === 'places' \? 'places' : 'segments'\}/);
  assert.match(pane, /viewMode=\{mapView\}/);
});

test('RouteMap pinta solo las ciudades definidas por los tramos', async () => {
  const content = await source();
  assert.match(content, /function orderedCities/);
  assert.match(content, /\[segment\.origin, segment\.destination\]/);
  assert.match(content, /routeCities\.forEach/);
  assert.match(content, /'circle-color': \['get', 'color'\]/);
});

test('los resultados se muestran como pestañas DOM, no como puntos', async () => {
  const content = await source();
  assert.match(content, /function markerElement/);
  assert.match(content, /place-result-marker/);
  assert.match(content, /new maplibregl\.Marker/);
  assert.match(content, /anchor: 'bottom'/);
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

test('la confirmación se abre únicamente al pulsar una pestaña de resultado', async () => {
  const content = await source();
  assert.match(content, /function openPlace\(place\)/);
  assert.match(content, /button\.addEventListener\('click',[\s\S]*openPlace\(place\)/);
  assert.match(content, /¿Guardar lugar para tu ruta\?/);
  assert.match(content, /className: 'place-save-popup'/);
  assert.match(content, /closeButton: true/);
  assert.match(content, /setMaxWidth\('320px'\)/);
  assert.doesNotMatch(content, /pendingSelectionRef|pendingPlace/);

  const chooseBlock = content.slice(
    content.indexOf('function chooseSuggestion'),
    content.indexOf('function clearSearch')
  );
  assert.match(chooseBlock, /setResults\(\[place\]\)/);
  assert.doesNotMatch(chooseBlock, /openPlace|savePrompt/);
});

test('guardar normaliza el lugar, valida coordenadas y cierra la confirmación', async () => {
  const content = await source();
  assert.match(content, /event\.stopPropagation\(\)/);
  assert.match(content, /alreadySaved/);
  assert.match(content, /lat: Number\(selected\.lat\)/);
  assert.match(content, /lon: Number\(selected\.lon\)/);
  assert.match(content, /isPlaced\(savedPlace\)/);
  assert.match(content, /addPlaceRef\.current\?\.\(savedPlace\)/);
  assert.match(content, /onClose: \(\) => popup\.remove\(\)/);
});

test('guardar un lugar confirma la acción sin mover nuevamente la cámara', async () => {
  const content = await source();
  assert.match(content, /lastRouteViewportKeyRef/);
  assert.match(content, /const routeViewportKey = showSegments/);
  assert.match(content, /if \(routeViewportKey !== lastRouteViewportKeyRef\.current\)/);
  assert.match(content, /setSaveNotice\('Lugar guardado'\)/);
  assert.match(content, /setTimeout\(\(\) => setSaveNotice\(''\), 2200\)/);
  assert.match(content, /role="status" aria-live="polite"/);

  const placesBlock = content.slice(
    content.indexOf('places.filter(isPlaced).forEach'),
    content.indexOf('sourceData(map, ROUTE_SOURCE_ID')
  );
  assert.doesNotMatch(placesBlock, /routeBounds\.extend/);
});

test('el formulario conserva la búsqueda explícita y sus validaciones', async () => {
  const content = await source();
  assert.match(content, /async function submitSearch/);
  assert.match(content, /<form className="geo-search" onSubmit=\{submitSearch\}>/);
  assert.match(content, /type="submit"/);
  assert.match(content, /text\.length < config\.geoapify\.searchMinChars/);
  assert.match(content, /setResults\(next\)/);
});

test('elegir una sugerencia centra el resultado sin lanzar otra búsqueda', async () => {
  const content = await source();
  assert.match(content, /function chooseSuggestion\(place\)/);
  assert.match(content, /if \(!isPlaced\(place\)\) return/);
  assert.match(content, /skipAutocompleteRef\.current = true/);
  assert.match(content, /setResults\(\[place\]\)/);
  assert.match(content, /validResults\.length === 1/);
  assert.match(content, /zoom: 14/);

  const chooseBlock = content.slice(
    content.indexOf('function chooseSuggestion'),
    content.indexOf('function clearSearch')
  );
  assert.doesNotMatch(chooseBlock, /searchGeoapifyPlaces|openPlace/);
  assert.match(chooseBlock, /autocompleteAbortRef\.current\?\.abort\(\)/);
  assert.match(chooseBlock, /searchAbortRef\.current\?\.abort\(\)/);
});

test('el botón cerrar limpia campo, resultados, sugerencias y solicitudes activas', async () => {
  const content = await source();
  assert.match(content, /function clearSearch\(\)/);
  assert.match(content, /setQuery\(''\)/);
  assert.match(content, /setResults\(\[\]\)/);
  assert.match(content, /setSuggestions\(\[\]\)/);
  assert.match(content, /activePromptRef\.current\?\.remove\(\)/);
  assert.match(content, /className="geo-search__clear"/);
  assert.match(content, /aria-label="Cerrar búsqueda y quitar resultados"/);
  assert.match(content, /onClick=\{clearSearch\}/);
});

test('las pestañas de resultados reducen su escala al alejar el mapa', async () => {
  const content = await source();
  const css = await read('src/modules/map/RouteMap.css');
  assert.match(content, /function resultMarkerScale\(zoom\)/);
  assert.match(content, /Math\.max\(0\.52, Math\.min\(1,/);
  assert.match(content, /map\.on\('zoom', syncResultMarkerScale\)/);
  assert.match(content, /--place-marker-scale/);
  assert.match(css, /transform:scale\(var\(--place-marker-scale\)\)/);
});

test('el cierre del mensaje de guardado tiene un área propia y no cubre Guardar', async () => {
  const css = await read('src/modules/map/RouteMap.css');
  assert.match(css, /place-save-popup \.maplibregl-popup-content\{width:max-content;min-width:286px;max-width:calc\(100vw - 24px\);padding:12px 46px 12px 14px\}/);
  assert.match(css, /place-save-prompt\{display:grid;grid-template-columns:minmax\(0,1fr\) auto/);
  assert.match(css, /place-save-popup \.maplibregl-popup-close-button\{top:6px;right:6px\}/);
});

test('limpiar o editar la consulta apaga inmediatamente el estado de sugerencias', async () => {
  const content = await source();
  assert.match(content, /function handleQueryChange/);
  assert.match(content, /setSuggesting\(false\)/);
  assert.match(content, /autocompleteSequenceRef\.current \+= 1/);
  assert.match(content, /setSuggestions\(\[\]\)/);
  assert.match(content, /query\.trim\(\)\.length >= config\.geoapify\.searchMinChars/);
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

test('RouteMap elimina marcadores, popups y solicitudes al actualizar o desmontar', async () => {
  const content = await source();
  assert.match(content, /resultMarkersRef\.current\.forEach/);
  assert.match(content, /activePromptRef\.current\?\.remove\(\)/);
  assert.match(content, /controller\.abort\(\)/);
  assert.match(content, /marker\.remove\(\)/);
});

test('Tramos no solicita ni persiste routing real de Geoapify', async () => {
  const content = await source();
  const client = await read('src/modules/places/geoapifyClient.js');
  const model = await read('src/modules/trips/tripModel.js');
  const pane = await read('src/app/AppMapPane.jsx');

  assert.doesNotMatch(content, /requestGeoapifyRoute|routeGeometryForDisplay|routeModeForSegment/);
  assert.doesNotMatch(client, /requestGeoapifyRoute/);
  assert.doesNotMatch(model, /route:/);
  assert.doesNotMatch(pane, /usePersistentSegmentRoutes/);
  assert.match(content, /coordinates: adaptiveCurve\(segment\.origin, segment\.destination\)/);
});
