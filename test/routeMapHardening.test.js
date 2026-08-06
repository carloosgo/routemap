import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const root = new globalThis.URL('../', import.meta.url);
async function read(path) { return readFile(new URL(path, root), 'utf8'); }

async function mapSources() {
  const paths = {
    route: 'src/modules/map/RouteMap.jsx',
    model: 'src/modules/map/routeMapModel.js',
    setup: 'src/modules/map/routeMapSetup.js',
    dom: 'src/modules/map/placeMapDom.js',
    form: 'src/modules/map/PlaceSearchForm.jsx',
    search: 'src/modules/map/usePlaceSearch.js',
    markers: 'src/modules/map/usePlaceResultMarkers.js',
    es: 'src/i18n/es.js',
    en: 'src/i18n/en.js',
  };
  const entries = await Promise.all(
    Object.entries(paths).map(async ([name, path]) => [name, await read(path)])
  );
  return Object.fromEntries(entries);
}

test('RouteMap muestra de forma declarativa los errores de configuración', async () => {
  const { route, es, en } = await mapSources();
  assert.match(route, /geo-map__missing/);
  assert.match(route, /t\('mapConfigMissingShort'\)/);
  assert.match(es, /mapConfigMissingShort: 'Falta VITE_GEOAPIFY_MAPS_API_KEY\.'/);
  assert.match(en, /mapConfigMissingShort: 'VITE_GEOAPIFY_MAPS_API_KEY is missing\.'/);
});

test('RouteMap vuelve a sincronizar las capas cuando cambia el viaje o la vista', async () => {
  const { route, model } = await mapSources();
  assert.match(route, /buildMapFeatureData\(\{[\s\S]*segments,[\s\S]*places,[\s\S]*routeConnections,[\s\S]*viewMode,[\s\S]*colorForIndex/);
  assert.match(route, /\[segments, places, routeConnections, viewMode, mapReady\]/);
  assert.match(model, /segments\.forEach\(\(segment, index\)/);
  assert.match(model, /colorForIndex\(index\)/);
});

test('Tramos conserva curvas adaptativas, colores y vuelos punteados', async () => {
  const { model, setup } = await mapSources();
  assert.match(model, /export function adaptiveCurve/);
  assert.match(model, /dominantTransport\(segment\) === 'plane'/);
  assert.match(model, /coordinates: adaptiveCurve\(segment\.origin, segment\.destination\)/);
  assert.match(setup, /filter: \['==', \['get', 'dashed'\], true\]/);
  assert.match(setup, /'line-dasharray': \[5, 4\]/);
  assert.match(setup, /'line-color': \['get', 'color'\]/);
});

test('Tramos y Lugares son capas independientes y mutuamente excluyentes', async () => {
  const { route, model } = await mapSources();
  const app = await read('src/App.jsx');
  const pane = await read('src/app/AppMapPane.jsx');

  assert.match(route, /viewMode = 'segments'/);
  assert.match(model, /const showSegments = viewMode === 'segments'/);
  assert.match(model, /const showPlaces = viewMode === 'places'/);
  assert.match(model, /const routeCities = showSegments \? orderedCities\(segments\) : \[\]/);
  assert.match(model, /if \(showSegments\) \{[\s\S]*segments\.forEach/);
  assert.match(model, /if \(showPlaces\) \{[\s\S]*places\.filter\(isPlaced\)\.forEach/);
  assert.match(route, /viewMode === 'places' && \([\s\S]*<PlaceSearchForm/);
  assert.match(app, /mapView=\{activeTab === 'places' \? 'places' : 'segments'\}/);
  assert.match(pane, /viewMode=\{mapView\}/);
});

test('Mis Rutas dibuja solo conexiones visibles con una línea negra independiente', async () => {
  const { route, model, setup } = await mapSources();
  assert.match(model, /export function savedPlaceRouteFeatures/);
  assert.match(model, /if \(route\?\.visible === false\) return \[\]/);
  assert.match(model, /normalizeRouteGeometry\(route\?\.geometry\)/);
  assert.match(route, /sourceData\(map, PLACE_ROUTE_SOURCE_ID/);
  assert.match(setup, /PLACE_ROUTE_SOURCE_ID = 'atlas-saved-place-routes'/);
  assert.match(setup, /PLACE_ROUTE_LAYER_ID = 'atlas-saved-place-routes-layer'/);
  assert.match(setup, /'line-color': '#111111'/);
  assert.match(setup, /'line-width': 2/);
});

test('el modelo pinta solo ciudades definidas por los tramos', async () => {
  const { model, setup } = await mapSources();
  assert.match(model, /export function orderedCities/);
  assert.match(model, /\[segment\.origin, segment\.destination\]/);
  assert.match(model, /routeCities\.forEach/);
  assert.match(setup, /'circle-color': \['get', 'color'\]/);
});

test('los resultados del mapa se mantienen textuales y no cargan imágenes o iconos de categoría', async () => {
  const { dom, markers, route } = await mapSources();
  assert.match(dom, /export function markerElement/);
  assert.match(dom, /place-result-marker/);
  assert.match(dom, /button\.append\(copy\)/);
  assert.match(markers, /new maplibregl\.Marker/);
  assert.match(markers, /anchor: 'bottom'/);
  assert.doesNotMatch(dom, /representativePlaceIcon|place-result-marker__media|place-result-marker__fallback/);
  assert.doesNotMatch(markers, /fetchGeoapifyPlaceImage|AbortController|image\.src/);
  assert.doesNotMatch(route, /representativePlaceIcon/);
});

test('la confirmación se abre solo al pulsar un resultado y guarda datos normalizados', async () => {
  const { dom, markers, es, en } = await mapSources();
  assert.match(markers, /function openPlace\(place\)/);
  assert.match(markers, /button\.addEventListener\('click',[\s\S]*openPlace\(place\)/);
  assert.match(dom, /translated\(t, 'savePlacePrompt'\)/);
  assert.match(es, /savePlacePrompt: '¿Guardar lugar para tu ruta\?'/);
  assert.match(en, /savePlacePrompt: 'Save this place to your trip\?'/);
  assert.match(markers, /className: 'place-save-popup'/);
  assert.match(markers, /closeButton: true/);
  assert.match(markers, /setMaxWidth\('320px'\)/);
  assert.match(markers, /event\.stopPropagation\(\)/);
  assert.match(markers, /lat: Number\(selected\.lat\)/);
  assert.match(markers, /lon: Number\(selected\.lon\)/);
  assert.match(markers, /isPlaced\(savedPlace\)/);
  assert.match(markers, /addPlaceRef\.current\?\.\(savedPlace\)/);
  assert.match(markers, /onClose: \(\) => popup\.remove\(\)/);
  assert.doesNotMatch(markers, /pendingSelectionRef|pendingPlace/);
});

test('guardar un lugar confirma la acción sin alterar el viewport de Tramos', async () => {
  const { route, markers, es, en } = await mapSources();
  assert.match(route, /lastRouteViewportKeyRef/);
  assert.match(route, /const routeViewportKey = showSegments/);
  assert.match(route, /if \(routeViewportKey !== lastRouteViewportKeyRef\.current\)/);
  assert.match(markers, /setSaveNotice\(t\('placeSaved'\)\)/);
  assert.match(es, /placeSaved: 'Lugar guardado'/);
  assert.match(en, /placeSaved: 'Place saved'/);
  assert.match(markers, /setTimeout\(\(\) => setSaveNotice\(''\), 2200\)/);
  assert.match(route, /role="status" aria-live="polite"/);
});

test('la búsqueda conserva validación, debounce y protección contra respuestas antiguas', async () => {
  const { form, search } = await mapSources();
  assert.match(search, /async function submitSearch/);
  assert.match(form, /<form className="geo-search" onSubmit=\{onSubmit\}>/);
  assert.match(form, /type="submit"/);
  assert.match(search, /text\.length < config\.geoapify\.searchMinChars/);
  assert.match(search, /setResults\(next\)/);
  assert.match(search, /config\.geoapify\.searchDebounceMs/);
  assert.match(search, /searchSequenceRef/);
  assert.match(search, /autocompleteSequenceRef/);
  assert.match(search, /sequence === searchSequenceRef\.current/);
  assert.match(search, /sequence === autocompleteSequenceRef\.current/);
  assert.match(search, /clearTimeout\(timer\)/);
});

test('elegir una sugerencia centra un resultado sin lanzar otra búsqueda', async () => {
  const { search, markers } = await mapSources();
  assert.match(search, /function chooseSuggestion\(place\)/);
  assert.match(search, /if \(!isPlaced\(place\)\) return/);
  assert.match(search, /skipAutocompleteRef\.current = true/);
  assert.match(search, /setResults\(\[place\]\)/);
  assert.match(markers, /validResults\.length === 1/);
  assert.match(markers, /zoom: 14/);

  const chooseBlock = search.slice(
    search.indexOf('function chooseSuggestion'),
    search.indexOf('function clearSearch')
  );
  assert.doesNotMatch(chooseBlock, /searchGeoapifyPlaces|openPlace/);
  assert.match(chooseBlock, /autocompleteAbortRef\.current\?\.abort\(\)/);
  assert.match(chooseBlock, /searchAbortRef\.current\?\.abort\(\)/);
});

test('cerrar la búsqueda limpia estado, resultados y solicitudes activas', async () => {
  const { form, search, markers, es, en } = await mapSources();
  assert.match(search, /function clearSearch\(\)/);
  assert.match(search, /setQuery\(''\)/);
  assert.match(search, /setResults\(\[\]\)/);
  assert.match(search, /setSuggestions\(\[\]\)/);
  assert.match(form, /className="geo-search__clear"/);
  assert.match(form, /aria-label=\{t\('closePlaceSearch'\)\}/);
  assert.match(es, /closePlaceSearch: 'Cerrar búsqueda y quitar resultados'/);
  assert.match(en, /closePlaceSearch: 'Close search and clear results'/);
  assert.match(form, /onClick=\{onClear\}/);
  assert.match(markers, /activePromptRef\.current\?\.remove\(\)/);
  assert.match(markers, /marker\.remove\(\)/);
});

test('los marcadores reducen su escala al alejar el mapa y liberan recursos', async () => {
  const { dom, markers } = await mapSources();
  const css = await read('src/modules/map/RouteMap.css');
  assert.match(dom, /export function resultMarkerScale\(zoom\)/);
  assert.match(dom, /Math\.max\(0\.52, Math\.min\(1,/);
  assert.match(markers, /map\.on\('zoom', syncResultMarkerScale\)/);
  assert.match(markers, /--place-marker-scale/);
  assert.match(markers, /map\.off\('zoom', syncResultMarkerScale\)/);
  assert.match(markers, /activePromptRef\.current\?\.remove\(\)/);
  assert.match(markers, /clearTimeout\(saveNoticeTimerRef\.current\)/);
  assert.match(markers, /marker\.remove\(\)/);
  assert.match(css, /transform:scale\(var\(--place-marker-scale\)\)/);
});

test('el popup de guardado conserva su área de cierre propia', async () => {
  const css = await read('src/modules/map/RouteMap.css');
  assert.match(css, /place-save-popup \.maplibregl-popup-content\{width:max-content;min-width:286px;max-width:calc\(100vw - 24px\);padding:12px 46px 12px 14px\}/);
  assert.match(css, /place-save-prompt\{display:grid;grid-template-columns:minmax\(0,1fr\) auto/);
  assert.match(css, /place-save-popup \.maplibregl-popup-close-button\{top:6px;right:6px\}/);
});

test('Tramos no solicita ni persiste routing real; Mis Rutas sí usa Geoapify entre lugares guardados', async () => {
  const sources = await mapSources();
  const placeClient = await read('src/modules/places/geoapifyClient.js');
  const routeClient = await read('src/modules/routes/geoapifyRouteClient.js');
  const panel = await read('src/modules/places/TripRouteConnections.jsx');
  const entities = await read('src/modules/trips/tripEntities.js');
  const combined = [sources.model, sources.search, sources.markers, placeClient].join('\n');

  assert.doesNotMatch(combined, /callable\('geoapifyRoute'\)|firebaseCallable\('geoapifyRoute'\)/);
  assert.match(sources.model, /coordinates: adaptiveCurve\(segment\.origin, segment\.destination\)/);
  assert.match(routeClient, /firebaseCallable\('geoapifyRoute'\)/);
  assert.match(routeClient, /origin: \{ lat: origin\.lat, lon: origin\.lon \}/);
  assert.match(routeClient, /destination: \{ lat: destination\.lat, lon: destination\.lon \}/);
  assert.match(panel, /requestSavedPlaceRoute\(origin, destination, routeMode\)/);
  assert.match(entities, /routeConnections: \[\]/);
});
