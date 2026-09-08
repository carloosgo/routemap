// test-contract: architecture
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const root = new URL('../', import.meta.url);
const read = (path) => readFile(new URL(path, root), 'utf8');

test('Mis Rutas sigue siendo la superficie principal sin restaurar Itinerario ni un editor paralelo de ciudades', async () => {
  const app = await read('src/App.jsx');
  const navigation = await read('src/app/TripHeaderNavigation.jsx');
  const editorModule = await read('src/app/AppEditorModule.jsx');
  const placesPanel = await read('src/modules/places/TripPlacesPanel.jsx');

  assert.match(app, /useState\('places'\)/, 'Mis Rutas debe ser la vista inicial');
  assert.doesNotMatch(navigation, /id: 'segments'|labelKey: 'itinerary'/);
  assert.match(navigation, /id: 'places', labelKey: 'myRoutes'/);
  assert.match(navigation, /id: 'notes', labelKey: 'notes'/);
  assert.match(editorModule, /activeTab !== 'notes'[\s\S]*?<TripPlacesPanel/);
  assert.match(editorModule, /removeSegment=\{removeSegment\}/);
  assert.match(editorModule, /reorderSegment=\{reorderSegment\}/);
  assert.match(editorModule, /toggleSegmentNote=\{itineraryPanels\.toggleNote\}/);
  assert.match(editorModule, /toggleSegmentDetails=\{itineraryPanels\.toggleDetails\}/);

  assert.doesNotMatch(placesPanel, /<CityAutocomplete|addSegment\?\.|updateOrigin/);
  assert.match(placesPanel, /className="trip-city__drag"/);
  assert.match(placesPanel, /reorderSegment\?\.\(current\.segmentId, current\.targetId, current\.placement\)/);
  assert.match(placesPanel, /removeSegment\?\.\(segmentToDelete\.id\)/);
});

test('cada ciudad conserva la banda compacta, divisor y drag sin una fila especial de origen', async () => {
  const panel = await read('src/modules/places/TripPlacesPanel.jsx');
  const css = await read('src/app/UnifiedMyRoutes.css');
  const interactionCss = await read('src/app/UnifiedMyRoutesInteraction.css');

  assert.match(
    css,
    /\.trip-places--unified \.trip-city\s*\{[^}]*margin:\s*0;[^}]*padding:\s*0;[^}]*border-bottom:\s*1px solid #e6e9ed;/s
  );
  assert.match(css, /\.trip-places--unified \.trip-city__bar\s*\{[^}]*min-height:\s*40px;/s);
  assert.match(interactionCss, /\.trip-places--unified \.trip-city__drag/);
  assert.match(interactionCss, /\.trip-places--unified \.trip-city\.is-city-dragging/);
  assert.doesNotMatch(panel, /ORIGIN_NOTE_TARGET|itinerary-origin|originDetails/);
});

test('el mapa de Mis Rutas mantiene Ciudades y Rutas como capas independientes sobre el buscador unificado', async () => {
  const app = await read('src/App.jsx');
  const mapPane = await read('src/app/AppMapPane.jsx');
  const map = await read('src/modules/map/GooglePlacesMap.jsx');
  const search = await read('src/modules/map/usePlaceSearch.js');

  assert.match(app, /<AppMapPane[\s\S]*mapView="places"/);
  assert.match(mapPane, /const \[showCityTrace, setShowCityTrace\] = useState\(true\)/);
  assert.match(mapPane, /const \[showSavedRoutes, setShowSavedRoutes\] = useState\(true\)/);
  assert.match(mapPane, /showCityTrace=\{unifiedRoutesView \? showCityTrace : true\}/);
  assert.match(mapPane, /showSavedRoutes=\{unifiedRoutesView \? showSavedRoutes : false\}/);
  assert.match(mapPane, /origin=\{unifiedRoutesView \? null : trip\.origin\}/);
  assert.match(map, /const placeSearch = usePlaceSearch\(\{ viewMode \}\)/);
  assert.match(search, /createGeoapifyCityProvider/);
  assert.match(search, /searchGooglePlaces/);
  assert.match(search, /setResults\(\[\.\.\.cities, \.\.\.places\]\)/);
});

test('el panel termina en el punto medio real entre separador e icono de Fechas y el buscador se reduce proporcionalmente', async () => {
  const hook = await read('src/app/useWorkspacePanelGeometry.js');
  const headerCss = await read('src/app/TripWorkspaceHeaderLayout.css');
  const interactionCss = await read('src/app/UnifiedMyRoutesInteraction.css');

  assert.match(hook, /const separatorX = finiteRectLeft\(metrics\)/);
  assert.match(hook, /const dateIconX = finiteRectLeft\(dateIcon\)/);
  assert.match(hook, /const panelEdge = separatorX \+ \(dateIconX - separatorX\) \/ 2/);
  assert.match(hook, /--workspace-panel-width/);
  assert.match(hook, /BASE_SEARCH_WIDTH \* \(currentMapWidth \/ baselineMapWidth\)/);
  assert.match(hook, /--geo-search-max-width/);
  assert.match(headerCss, /--workspace-header-split-width/);
  assert.match(headerCss, /--workspace-panel-width: var\(--workspace-header-split-width\)/);
  assert.match(interactionCss, /var\(--geo-search-max-width, 550px\)/);
});
