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
  const routesPanel = await read('src/modules/places/TripDayRoutesPanel.jsx');

  assert.match(app, /useState\('places'\)/, 'Mis Rutas debe ser la vista inicial');
  assert.doesNotMatch(navigation, /id: 'segments'|labelKey: 'itinerary'/);
  assert.match(navigation, /id: 'places', labelKey: 'myRoutes'/);
  assert.match(navigation, /id: 'notes', labelKey: 'notes'/);
  assert.match(editorModule, /activeTab !== 'notes'[\s\S]*?<TripDayRoutesPanel/);
  assert.match(editorModule, /removeSegment=\{removeSegment\}/);
  assert.match(editorModule, /reorderSegment=\{reorderSegment\}/);
  assert.match(editorModule, /toggleSegmentNote=\{itineraryPanels\.toggleNote\}/);
  assert.match(editorModule, /toggleSegmentDetails=\{itineraryPanels\.toggleDetails\}/);

  assert.doesNotMatch(routesPanel, /<CityAutocomplete|addSegment\?\.|updateOrigin/);
  assert.match(routesPanel, /className="trip-city__drag"/);
  assert.match(routesPanel, /reorderSegment\?\.\(current\.segmentId, current\.targetId, current\.placement\)/);
  assert.match(routesPanel, /removeSegment\?\.\(segmentToDelete\.id\)/);
});

test('cada ciudad conserva banda compacta, drag y eliminación inline dentro del día global', async () => {
  const panel = await read('src/modules/places/TripDayRoutesPanel.jsx');
  const css = await read('src/app/UnifiedMyRoutes.css');
  const interactionCss = await read('src/app/UnifiedMyRoutesInteraction.css');

  assert.match(
    css,
    /\.trip-places--unified \.trip-city\s*\{[^}]*margin:\s*0;[^}]*padding:\s*0;[^}]*border-bottom:\s*1px solid #e6e9ed;/s
  );
  assert.match(interactionCss, /\.trip-places--unified \.trip-city__bar\s*\{[^}]*height:\s*40px;[^}]*min-height:\s*40px;/s);
  assert.match(interactionCss, /\.trip-places--unified \.trip-city__drag/);
  assert.match(panel, /data-city-order-id=\{isFirstAssignment \? segment\.id : undefined\}/);
  assert.match(panel, /className="trip-city__action trip-city__remove"/);
  assert.match(interactionCss, /\.trip-places--unified \.trip-city__remove\s*\{[^}]*opacity:\s*0;[^}]*pointer-events:\s*none;/s);
  assert.match(interactionCss, /\.trip-places--unified \.trip-city__bar:hover \.trip-city__remove,[\s\S]*opacity:\s*1;[\s\S]*pointer-events:\s*auto;/s);
  assert.doesNotMatch(panel, /ORIGIN_NOTE_TARGET|itinerary-origin|originDetails/);
});

test('el día global posee la fecha y la ciudad conserva importe y acciones de gastos', async () => {
  const panel = await read('src/modules/places/TripDayRoutesPanel.jsx');

  assert.match(panel, /calendarDays\.map\(\(calendarDay\) =>/);
  assert.match(panel, /\{t\('day'\)\} \{calendarDay\.globalDayNumber\} · \{formatDayDate\(calendarDay\.date, intlLocale\)\}/);
  assert.match(panel, /<span className="trip-city__amount"/);
  assert.match(panel, /className="trip-city__action trip-city__expense"[\s\S]*onClick=\{\(\) => toggleSegmentDetails\?\.\(segment\.id\)\}/);
  assert.doesNotMatch(panel, /className=\{'trip-city__date'/);
  assert.match(panel, /assignments\.length > 0[\s\S]*t\('tripDayNoCity'\)/);
});

test('el mapa de Mis Rutas mantiene Ciudades y Lugares independientes sin apagar las rutas guardadas', async () => {
  const app = await read('src/App.jsx');
  const mapPane = await read('src/app/AppMapPane.jsx');
  const routeMap = await read('src/modules/map/RouteMap.jsx');
  const polish = await read('src/modules/map/UnifiedSearchPolish.css');
  const search = await read('src/modules/map/usePlaceSearch.js');

  assert.match(app, /<AppMapPane[\s\S]*mapView="places"/);
  assert.match(mapPane, /const \[showCityTrace, setShowCityTrace\] = useState\(true\)/);
  assert.match(mapPane, /const \[showSavedPlaces, setShowSavedPlaces\] = useState\(true\)/);
  assert.match(mapPane, /data-saved-places-visible=\{unifiedRoutesView && showSavedPlaces \? 'true' : 'false'\}/);
  assert.match(mapPane, /setShowCityTrace\(\(value\) => !value\)/);
  assert.match(mapPane, /setShowSavedPlaces\(\(value\) => !value\)/);
  assert.match(mapPane, /t\('mapCities'\)/);
  assert.match(mapPane, /t\('mapSavedPlaces'\)/);
  assert.match(routeMap, /showSavedRoutes=\{viewMode === 'places'\}/);
  assert.match(polish, /data-saved-places-visible="false"\][\s\S]*\.google-saved-place-marker\s*\{[^}]*display:\s*none !important;/s);
  assert.match(search, /createGeoapifyCityProvider/);
  assert.match(search, /searchGooglePlaces/);
  assert.doesNotMatch(search, /setResults\(\[\.\.\.cities, \.\.\.places\]\)/);
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
  assert.match(interactionCss, /var\(--geo-search-max-width, 440px\)/);
});
