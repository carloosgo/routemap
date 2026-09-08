// test-contract: architecture
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const root = new URL('../', import.meta.url);
const read = (path) => readFile(new URL(path, root), 'utf8');

test('Mis Rutas reemplaza la superficie separada de Itinerario sin duplicar el dominio', async () => {
  const app = await read('src/App.jsx');
  const navigation = await read('src/app/TripHeaderNavigation.jsx');
  const editorModule = await read('src/app/AppEditorModule.jsx');
  const placesPanel = await read('src/modules/places/TripPlacesPanel.jsx');

  assert.match(app, /useState\('places'\)/, 'Mis Rutas debe ser la vista inicial');
  assert.doesNotMatch(
    navigation,
    /\{ id: 'segments', labelKey: 'itinerary'/,
    'Itinerario no debe conservar una pestaña paralela'
  );
  assert.match(navigation, /id: 'places', labelKey: 'myRoutes'/);
  assert.match(navigation, /id: 'notes', labelKey: 'notes'/);

  assert.match(
    editorModule,
    /activeTab !== 'notes'[\s\S]*?<TripPlacesPanel/,
    'toda vista principal distinta de Notas debe usar la superficie unificada'
  );
  for (const callback of [
    'updateSegment',
    'updateOrigin',
    'addSegment',
    'removeSegment',
    'reorderSegment',
  ]) {
    assert.match(
      editorModule,
      new RegExp(`${callback}=\\{${callback}\\}`),
      `Mis Rutas debe reutilizar el callback canónico ${callback}`
    );
  }

  assert.match(placesPanel, /<CityAutocomplete/);
  assert.match(placesPanel, /onClick=\{\(\) => addSegment\?\.\(\)\}/);
  assert.match(placesPanel, /reorderSegment\?\.\(segment\.id,/);
  assert.match(placesPanel, /removeSegment\?\.\(segmentToDelete\.id\)/);
});

test('cada ciudad usa la banda compacta aprobada y un divisor incluso dentro del mismo país', async () => {
  const css = await read('src/app/UnifiedMyRoutes.css');

  assert.match(
    css,
    /\.trip-places--unified \.trip-city\s*\{[^}]*margin:\s*0;[^}]*padding:\s*0;[^}]*border-bottom:\s*1px solid #e6e9ed;/s,
    'el divisor debe pertenecer a cada ciudad, no sólo a cambios de país'
  );
  assert.match(
    css,
    /\.trip-places--unified \.trip-city__bar\s*\{[^}]*min-height:\s*40px;/s,
    'la barra de ciudad debe conservar el alto compacto aprobado de 40 px'
  );
});

test('Mis Rutas alterna entre las proyecciones existentes de Ciudades y Rutas', async () => {
  const mapPane = await read('src/app/AppMapPane.jsx');
  const detailsModal = await read('src/modules/trips/ItineraryDetailsModal.jsx');

  assert.match(mapPane, /useState\('places'\)/);
  assert.match(mapPane, /effectiveMapView = mapView === 'places' \? myRoutesMapMode : mapView/);
  assert.match(mapPane, /setMyRoutesMapMode\('segments'\)/);
  assert.match(mapPane, /setMyRoutesMapMode\('places'\)/);
  assert.match(mapPane, /viewMode=\{effectiveMapView\}/);

  assert.match(
    detailsModal,
    /const originName = trip\.origin\?\.name \|\| t\('origin'\);/,
    'el modal de origen debe leer el origen canónico del viaje'
  );
});
