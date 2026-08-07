import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const root = new globalThis.URL('../', import.meta.url);
async function read(path) { return readFile(new URL(path, root), 'utf8'); }

async function mapSources() {
  const paths = {
    route: 'src/modules/map/RouteMap.jsx',
    itinerary: 'src/modules/map/ItineraryRouteMap.jsx',
    google: 'src/modules/map/GooglePlacesMap.jsx',
    model: 'src/modules/map/routeMapModel.js',
    setup: 'src/modules/map/routeMapSetup.js',
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

test('Itinerario y Mis Rutas usan mapas independientes sin mezclar proveedores', async () => {
  const { route, itinerary, google } = await mapSources();

  assert.match(route, /<ItineraryRouteMap segments=\{segments\} \/>/);
  assert.match(route, /<GooglePlacesMap[\s\S]*places=\{places\}[\s\S]*routeConnections=\{routeConnections\}/);
  assert.match(route, /active=\{viewMode === 'places'\}/);
  assert.match(itinerary, /import \* as maplibregl from 'maplibre-gl'/);
  assert.match(itinerary, /config\.geoapify\.mapApiKey/);
  assert.match(google, /loadGoogleMaps\(\)/);
  assert.doesNotMatch(itinerary, /googleRouteOptimized|googlePlaceAutocomplete|googlePlaceSearch/);
});

test('Mis Rutas monta Google Maps de forma lazy y lo conserva al cambiar de pestaña', async () => {
  const { route, google } = await mapSources();

  assert.match(route, /const \[placesMapMounted, setPlacesMapMounted\] = useState\(viewMode === 'places'\)/);
  assert.match(route, /if \(viewMode === 'places'\) setPlacesMapMounted\(true\)/);
  assert.match(route, /\{placesMapMounted && \(/);
  assert.match(route, /active=\{viewMode === 'places'\}/);
  assert.match(google, /usePlaceSearch\(\{ viewMode: active \? 'places' : 'segments' \}\)/);
  assert.match(google, /if \(!active \|\| !mapConfigured\) return undefined/);
});

test('Itinerario conserva curvas adaptativas, colores y vuelos punteados', async () => {
  const { itinerary, model, setup } = await mapSources();

  assert.match(model, /export function adaptiveCurve/);
  assert.match(model, /dominantTransport\(segment\) === 'plane'/);
  assert.match(model, /coordinates: adaptiveCurve\(segment\.origin, segment\.destination\)/);
  assert.match(setup, /filter: \['==', \['get', 'dashed'\], true\]/);
  assert.match(setup, /'line-dasharray': \[5, 4\]/);
  assert.match(setup, /'line-color': \['get', 'color'\]/);
  assert.match(itinerary, /buildMapFeatureData\(\{[\s\S]*segments,[\s\S]*places: \[\],[\s\S]*routeConnections: \[\],[\s\S]*viewMode: 'segments'/);
});

test('Itinerario conserva su error de configuración de Geoapify y Mis Rutas exige Google key + Map ID', async () => {
  const { itinerary, google, es, en } = await mapSources();

  assert.match(itinerary, /t\('mapConfigMissingShort'\)/);
  assert.match(es, /mapConfigMissingShort: 'Falta VITE_GEOAPIFY_MAPS_API_KEY\.'/);
  assert.match(en, /mapConfigMissingShort: 'VITE_GEOAPIFY_MAPS_API_KEY is missing\.'/);
  assert.match(google, /config\.googleMaps\.webApiKey && config\.googleMaps\.mapId/);
  assert.match(google, /t\('googleMapConfigMissingShort'\)/);
  assert.match(google, /mapId: config\.googleMaps\.mapId/);
});

test('Google Maps usa marcadores propios y dibuja solo rutas visibles en negro', async () => {
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

  assert.match(google, /if \(!active \|\| !mapConfigured\) return undefined/);
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
  assert.match(search, /clearTimeout\(timer\)/);
});

test('volver a Mis Rutas no dispara Autocomplete sin una edición nueva', async () => {
  const { search } = await mapSources();

  assert.match(search, /const previousViewModeRef = useRef\(viewMode\)/);
  assert.match(search, /const previousViewMode = previousViewModeRef\.current/);
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
  assert.match(search, /const placeId = String\(prediction\?\.id \|\| ''\)\.trim\(\)/);
  assert.match(search, /resolveGooglePlace\(prediction, token, \{ signal: controller\.signal \}\)/);
  assert.match(search, /skipAutocompleteRef\.current = true/);
  assert.match(search, /setResults\(\[\{ \.\.\.place, userLabel \}\]\)/);
  assert.match(placesClient, /firebaseCallable\('googlePlaceDetailsEssentials'\)/);

  const chooseBlock = search.slice(
    search.indexOf('async function chooseSuggestion'),
    search.indexOf('function clearSearch')
  );
  assert.doesNotMatch(chooseBlock, /searchGooglePlaces|googlePlaceSearch/);
  assert.match(chooseBlock, /autocompleteAbortRef\.current\?\.abort\(\)/);
  assert.match(chooseBlock, /searchAbortRef\.current\?\.abort\(\)/);
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
  assert.match(form, /onClick=\{onClear\}/);
  assert.match(es, /closePlaceSearch: 'Cerrar búsqueda y quitar resultados'/);
  assert.match(en, /closePlaceSearch: 'Close search and clear results'/);
});

test('el cliente de Places deduplica llamadas simultáneas y cachea solo ubicaciones', async () => {
  const { placesClient } = await mapSources();

  assert.match(placesClient, /const pendingRequests = new Map\(\)/);
  assert.match(placesClient, /async function sharedRequest/);
  assert.match(placesClient, /if \(pendingRequests\.has\(key\)\) return pendingRequests\.get\(key\)/);
  assert.match(placesClient, /const locationMemoryCache = new Map\(\)/);
  assert.match(placesClient, /config\.googleMaps\.locationCacheKey/);
  assert.match(placesClient, /config\.googleMaps\.locationCacheTtlMs/);
  assert.match(placesClient, /expiresAt/);
  assert.doesNotMatch(placesClient, /setCached\(key, suggestions\)|setCached\(key, results\)/);
});

test('Google Routes usa placeId directamente y evita duplicar la misma ruta en vuelo', async () => {
  const { routeClient } = await mapSources();

  assert.match(routeClient, /if \(isGooglePlaceReference\(place\)\)/);
  assert.match(routeClient, /return \{ placeId: place\.googlePlaceId \}/);
  assert.match(routeClient, /firebaseCallable\('googleRouteOptimized'\)/);
  assert.match(routeClient, /const pendingRoutes = new Map\(\)/);
  assert.match(routeClient, /if \(pendingRoutes\.has\(key\)\) return pendingRoutes\.get\(key\)/);
  assert.match(routeClient, /origin: originWaypoint/);
  assert.match(routeClient, /destination: destinationWaypoint/);
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
  assert.match(es, /savePlacePrompt: '¿Guardar lugar para tu ruta\?'/);
  assert.match(en, /savePlacePrompt: 'Save this place to your trip\?'/);
  assert.match(google, /provider: 'google'/);
  assert.match(google, /googlePlaceId: selected\.googlePlaceId \|\| selected\.id/);
  assert.match(google, /userLabel: selected\.userLabel \|\| ''/);
  assert.match(google, /lat: Number\(selected\.lat\)/);
  assert.match(google, /lon: Number\(selected\.lon\)/);
  assert.match(google, /isPlaced\(savedPlace\)/);
  assert.match(google, /addPlace\?\.\(savedPlace\)/);
  assert.match(google, /setSaveNotice\(t\('placeSaved'\)\)/);
});
