// test-contract: architecture
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const root = new URL('../', import.meta.url);
const read = (path) => readFile(new URL(path, root), 'utf8');

test('Mis Rutas no permite arrastrar días completos y muestra Por organizar arriba', async () => {
  const panel = await read('src/modules/places/TripPlacesDayFirstPanel.jsx');

  assert.doesNotMatch(panel, /startDayDrag|reorderTripDay|dayDrag/);
  assert.match(panel, /grouped\.unassigned\.length > 0 && \(\s*<button[\s\S]*?mr__pending/);
  assert.match(panel, /data-unassigned-places/);
  assert.match(panel, /dayCityNames\(assignmentsByDay\.get\(day\.tripDayOffset\)\)/);
});

test('Mis Rutas elige el día en una barra de cuadros y muestra un solo día a la vez', async () => {
  const panel = await read('src/modules/places/TripPlacesDayFirstPanel.jsx');

  assert.match(panel, /cityDayGroups\(grouped\.groups, assignmentsByDay\)/);
  assert.match(panel, /className="mr__strip"/);
  assert.match(panel, /className=\{'mr-daytile'/);
  assert.match(panel, /onClick=\{\(\) => setOpenDay\(day\.tripDayOffset\)\}/);
  // Cabecera: bandera y ciudad grandes; debajo "Día N · X lugares · Y km".
  assert.match(panel, /className="mr__dayhead-city"/);
  assert.match(panel, /className="mr__dayhead-sub"/);
  assert.match(panel, /\{renderDayBody\(selectedDay\)\}/);
  assert.doesNotMatch(panel, /className="mr__city"/);
});

test('cada lugar es una tarjeta con gestos: tocar, mantener para mover, deslizar para borrar', async () => {
  const panel = await read('src/modules/places/TripPlacesDayFirstPanel.jsx');

  assert.match(panel, /function SwipePlaceCard\(/);
  assert.match(panel, /data-city-gesture/);
  assert.match(panel, /className="mr-card__delete"/);
  assert.doesNotMatch(panel, /mr-place__remove/);
});

test('cada parada muestra su número del día, sin miniatura de Street View', async () => {
  const panel = await read('src/modules/places/TripPlacesDayFirstPanel.jsx');

  assert.match(panel, /renderPlace\(place, index \+ 1\)/);
  // El número es también el asa para arrastrar el lugar (sin icono de puntitos).
  assert.match(panel, /className=\{'mr-place__num mr-place__drag'/);
  assert.doesNotMatch(panel, /IconGripVertical/);
  assert.doesNotMatch(panel, /StreetViewThumbnail|PlacePhotoThumbnail/);
});

test('el tramo entre lugares muestra el modo elegido y se cambia desde una lista desplegable', async () => {
  const connector = await read('src/modules/places/TripRouteConnections.jsx');

  assert.match(connector, /aria-haspopup="listbox"/);
  assert.match(connector, /role="listbox"/);
  assert.match(connector, /role="option"/);
  assert.match(connector, /\/\/ Las estimaciones \(Geoapify\) se piden solo al desplegar la lista\./);
  assert.doesNotMatch(connector, /IntersectionObserver/);
});

test('el mapa agrupa transporte y lugares de otros días en un único control Capas', async () => {
  const map = await read('src/modules/map/GooglePlacesMap.jsx');

  assert.match(map, /data-map-layers/);
  assert.match(map, /t\('mapLayers'\)/);
  assert.match(map, /t\('mapLayerTransit'\)/);
  assert.match(map, /t\('mapLayerOtherDays'\)/);
  // Mismo zoom nativo que el Itinerario; Capas, circular, en la esquina bajo + / −.
  assert.doesNotMatch(map, /zoomControl: !placesActive/);
  assert.match(map, /zoomControlOptions: \{ position: maps\.ControlPosition\?\.RIGHT_BOTTOM \}/);
  assert.doesNotMatch(map, /map\.controls\[maps\.ControlPosition\.BOTTOM_RIGHT\]/);
  assert.match(map, /className="map-layers-capsule"/);
  assert.match(map, /borderRadius: '50%'/);
  assert.doesNotMatch(map, /IconBus/);
});
