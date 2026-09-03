import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const root = new globalThis.URL('../', import.meta.url);
async function read(path) { return readFile(new URL(path, root), 'utf8'); }

async function mapSources() {
  const paths = {
    route: 'src/modules/map/RouteMap.jsx',
    projection: 'src/modules/map/itineraryMapProjection.js',
    google: 'src/modules/map/GooglePlacesMap.jsx',
    model: 'src/modules/map/routeMapModel.js',
    dom: 'src/modules/map/placeMapDom.js',
    form: 'src/modules/map/PlaceSearchForm.jsx',
    search: 'src/modules/map/usePlaceSearch.js',
    placesClient: 'src/modules/places/googlePlacesClient.js',
    routeClient: 'src/modules/routes/googleRouteClient.js',
    workspace: 'src/app/AppWorkspace.jsx',
    es: 'src/i18n/es.js',
    en: 'src/i18n/en.js',
  };
  const entries = await Promise.all(
    Object.entries(paths).map(async ([name, path]) => [name, await read(path)])
  );
  return Object.fromEntries(entries);
}

test('Itinerario y Mis Rutas comparten una sola instancia de Google Maps', async () => {
  const { route, projection, google } = await mapSources();

  assert.match(route, /<GooglePlacesMap/);
  assert.match(route, /itineraryMapProjectionSignature\(origin, segments\)/);
  assert.match(route, /\[origin, segments\]/);
  assert.match(route, /segments=\{mapSegments\}/);
  assert.match(route, /places=\{places\}/);
  assert.match(route, /routeConnections=\{routeConnections\}/);
  assert.match(route, /viewMode=\{viewMode\}/);
  assert.match(projection, /export function itineraryMapProjection/);
  assert.doesNotMatch(route, /ItineraryRouteMap|maplibregl|route-map-layer|placesMapMounted/);
  assert.match(google, /const placesActive = viewMode === 'places'/);
  assert.match(google, /loadGoogleMaps\(\)/);
  assert.doesNotMatch(google, /maplibregl|createGeoapifyStyleUrl/);
});

test('el mapa Google corrige tamaño al cambiar de vista y al redimensionar el panel', async () => {
  const { google } = await mapSources();

  assert.match(google, /function syncMapElementSize/);
  assert.match(google, /new ResizeObserver\(resizeHandler\)/);
  assert.match(google, /globalThis\.addEventListener\?\.\('resize', resizeHandler\)/);
  assert.match(google, /requestAnimationFrame\(resizeHandler\)/);
  assert.match(google, /maps\.event\.trigger\(currentMap, 'resize'\)/);
  assert.match(google, /requestAnimationFrame\(\(\) => \{/);
  assert.match(google, /maps\.event\.trigger\(map, 'resize'\)/);
  assert.match(google, /\[ready, viewMode\]/);
});

test('Itinerario conserva curvas adaptativas, colores y trazado discontinuo sobre Google', async () => {
  const { google, model } = await mapSources();

  assert.match(model, /export function adaptiveCurve/);
  assert.match(model, /dominantTransport\(segment\) === 'plane'/);
  assert.match(model, /coordinates: adaptiveCurve\(segment\.origin, segment\.destination\)/);
  assert.match(google, /buildMapFeatureData\(\{[\s\S]*segments,[\s\S]*viewMode: 'segments'/);
  assert.match(google, /color: feature\.properties\?\.color \|\| '#111111'/);
  assert.match(google, /createCrispDashedRoutes\(\{ maps, map, routes \}\)/);
  assert.match(google, /google-itinerary-city-marker/);
});

test('todo el lienzo de mapa exige Google key + Map ID', async () => {
  const { google, es, en } = await mapSources();

  assert.match(google, /config\.googleMaps\.webApiKey && config\.googleMaps\.mapId/);
  assert.match(google, /t\('googleMapConfigMissingShort'\)/);
  assert.match(google, /mapId: config\.googleMaps\.mapId/);
  assert.match(es, /googleMapConfigMissingShort:/);
  assert.match(en, /googleMapConfigMissingShort:/);
  assert.doesNotMatch(google, /config\.geoapify\.mapApiKey/);
});

test('Mis Rutas usa Advanced Markers y dibuja solo rutas visibles en negro', async () => {
  const { google, dom } = await mapSources();

  assert.match(google, /AdvancedMarkerElement/);
  assert.match(google, /google-saved-place-marker/);
  assert.match(google, /route\.visible !== false && route\.geometry/);
  assert.match(google, /new maps\.Polyline/);
  assert.match(google, /strokeColor: '#111111'/);
  assert.match(google, /strokeWeight: 2/);
  assert.match(dom, /export function markerElement/);
  assert.match(dom, /place-result-marker/);
  assert.doesNotMatch(dom, /representativePlaceIcon|place-result-marker__media|place-result-marker__fallback/);
});

test('Google Maps solo resuelve ubicaciones guardadas cuando Mis Rutas está activo', async () => {
  const { google } = await mapSources();

  assert.match(google, /if \(!placesActive \|\| !mapConfigured\) return undefined/);
  assert.match(google, /isGooglePlaceReference\(place\) && !isPlaced\(place\)/);
  assert.match(google, /loadGooglePlaceLocations\(placeIds, \{ signal: controller\.signal \}\)/);
  assert.match(google, /cachedLocations\[place\.googlePlaceId\]/);
  assert.doesNotMatch(google, /refreshGooglePlace|googlePlaceDetailsEssentials/);
});

test('la búsqueda Google conserva validación, debounce y protección contra respuestas antiguas', async () => {
  const { form, search } = await mapSources();

  assert.match(search, /async function submitSearch/);
  assert.match(form, /<form className="geo-search" onSubmit=\{onSubmit\}>/);
  assert.match(form, /type="submit"/);
  assert.match(search, /text\.length < config\.googleMaps\.searchMinChars/);
  assert.match(search, /config\.googleMaps\.searchDebounceMs/);
  assert.match(search, /autocompleteGooglePlaces\(/);
  assert.match(search, /searchGooglePlaces\(/);
  assert.match(search, /searchSequenceRef/);
  assert.match(search, /autocompleteSequenceRef/);
  assert.match(search, /sequence === searchSequenceRef\.current/);
  assert.match(search, /sequence === autocompleteSequenceRef\.current/);
});

test('volver a Mis Rutas no dispara Autocomplete sin una edición nueva', async () => {
  const { search } = await mapSources();

  assert.match(search, /const previousViewModeRef = useRef\(viewMode\)/);
  assert.match(search, /if \(previousViewMode !== 'places'\)/);
  const guardBlock = search.slice(
    search.indexOf("if (previousViewMode !== 'places')"),
    search.indexOf('if (skipAutocompleteRef.current)')
  );
  assert.match(guardBlock, /return undefined/);
  assert.doesNotMatch(guardBlock, /autocompleteGooglePlaces/);
});

test('elegir una sugerencia resuelve Place Details Essentials sin lanzar Text Search', async () => {
  const { search, placesClient } = await mapSources();

  assert.match(search, /async function chooseSuggestion\(prediction\)/);
  assert.match(search, /resolveGooglePlace\(prediction, token, \{ signal: controller\.signal \}\)/);
  assert.match(search, /skipAutocompleteRef\.current = true/);
  assert.match(search, /setResults\(\[\{ \.\.\.place, userLabel \}\]\)/);
  assert.match(placesClient, /firebaseCallable\('googlePlaceDetailsEssentials'\)/);

  const chooseBlock = search.slice(
    search.indexOf('async function chooseSuggestion'),
    search.indexOf('function clearSearch')
  );
  assert.doesNotMatch(chooseBlock, /searchGooglePlaces|googlePlaceSearch/);
});

test('cerrar la búsqueda limpia estado, renueva sesión y cancela solicitudes activas', async () => {
  const { form, search, es, en } = await mapSources();

  assert.match(search, /function clearSearch\(\)/);
  assert.match(search, /autocompleteAbortRef\.current\?\.abort\(\)/);
  assert.match(search, /searchAbortRef\.current\?\.abort\(\)/);
  assert.match(search, /renewSession\(\)/);
  assert.match(search, /setQuery\(''\)/);
  assert.match(search, /setResults\(\[\]\)/);
  assert.match(search, /setSuggestions\(\[\]\)/);
  assert.match(form, /className="geo-search__clear"/);
  assert.match(es, /closePlaceSearch:/);
  assert.match(en, /closePlaceSearch:/);
});

test('el cliente de Places deduplica llamadas simultáneas y cachea solo ubicaciones', async () => {
  const { placesClient } = await mapSources();

  assert.match(placesClient, /const pendingRequests = new Map\(\)/);
  assert.match(placesClient, /async function sharedRequest/);
  assert.match(placesClient, /if \(pendingRequests\.has\(key\)\) return pendingRequests\.get\(key\)/);
  assert.match(placesClient, /const locationMemoryCache = new Map\(\)/);
  assert.match(placesClient, /config\.googleMaps\.locationCacheKey/);
  assert.match(placesClient, /config\.googleMaps\.locationCacheTtlMs/);
  assert.doesNotMatch(placesClient, /setCached\(key, suggestions\)|setCached\(key, results\)/);
});

test('Google Routes usa placeId directamente y evita duplicar la misma ruta en vuelo', async () => {
  const { routeClient } = await mapSources();

  assert.match(routeClient, /if \(isGooglePlaceReference\(place\)\)/);
  assert.match(routeClient, /return \{ placeId: place\.googlePlaceId \}/);
  assert.match(routeClient, /firebaseCallable\('googleRouteOptimized'\)/);
  assert.match(routeClient, /const pendingRoutes = new Map\(\)/);
  assert.match(routeClient, /if \(pendingRoutes\.has\(key\)\) return pendingRoutes\.get\(key\)/);
});

test('el workspace monta una sola instancia del mapa y en móvil espera hasta abrir Mapa', async () => {
  const { workspace } = await mapSources();

  assert.match(workspace, /const MOBILE_MEDIA_QUERY = '\(max-width: 720px\)'/);
  assert.match(workspace, /\{!mobileViewport && mapPane\}/);
  assert.match(workspace, /\{mobileViewport && mobileMapMounted && mapPane\}/);
  assert.match(workspace, /mobileView === 'map'/);
  assert.match(workspace, /setMobileMapMounted\(true\)/);
});

test('guardar un lugar Google mantiene confirmación explícita y etiqueta del usuario', async () => {
  const { google, dom, es, en } = await mapSources();

  assert.match(dom, /translated\(t, 'savePlacePrompt'\)/);
  assert.match(es, /savePlacePrompt:/);
  assert.match(en, /savePlacePrompt:/);
  assert.match(google, /provider: 'google'/);
  assert.match(google, /googlePlaceId: selected\.googlePlaceId \|\| selected\.id/);
  assert.match(google, /userLabel: selected\.userLabel \|\| ''/);
  assert.match(google, /addPlace\?\.\(savedPlace\)/);
  assert.match(google, /setSaveNotice\(t\('placeSaved'\)\)/);
});