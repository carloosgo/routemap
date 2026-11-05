// test-contract: behavior
import test from 'node:test';
import assert from 'node:assert/strict';

import { createPlace, createSegment } from '../src/modules/trips/tripModel.js';
import {
  cityDayGroups,
  dayRouteTotals,
  defaultOpenDay,
  formatDistance,
  groupPlacesByItineraryDay,
  itineraryAssignmentsByDay,
  placeCountryColors,
  placeDayIndex,
} from '../src/modules/places/placesDayModel.js';
import {
  clearLiveRoutesForTests,
  ensureLiveRoute,
  setLiveRoute,
  withLiveGeometry,
} from '../src/modules/routes/liveRouteStore.js';
import {
  arcPath,
  pendingLineLayer,
  routeDrawSegments,
  routeLineLayers,
} from '../src/modules/map/myRoutesMapStyle.js';
import { routeStroke, transitItinerary, transitLineBadges, transitVehicleKey } from '../src/modules/places/routeConnectionStyle.js';

function city(id, name, country, countryCode, lat, lon) {
  return { id, name, displayName: `${name}, ${country}`, country, countryCode, lat, lon };
}

const madrid = city('madrid', 'Madrid', 'España', 'ES', 40.4168, -3.7038);
const lisboa = city('lisboa', 'Lisboa', 'Portugal', 'PT', 38.7223, -9.1393);

function segments() {
  return [
    createSegment({ id: 'mad', destination: madrid, startDate: '2026-11-30', endDate: '2026-12-02' }),
    createSegment({ id: 'lis', destination: lisboa, startDate: '2026-12-02', endDate: '2026-12-04' }),
  ];
}

function place(id, segmentId, dayOffset) {
  return createPlace({ id, name: id, lat: 40, lon: -3, segmentId, dayOffset });
}

const fakeMaps = { SymbolPath: { CIRCLE: 0 } };

test('las paradas se numeran por día y el número es el mismo para la lista y el mapa', () => {
  const places = [place('a', 'mad', 0), place('b', 'mad', 0), place('c', 'mad', 1)];
  const index = placeDayIndex(places, segments());

  assert.deepEqual(index.get('a'), { tripDayOffset: 0, number: 1 });
  assert.deepEqual(index.get('b'), { tripDayOffset: 0, number: 2 });
  assert.deepEqual(index.get('c'), { tripDayOffset: 1, number: 1 });
});

test('los días se agrupan por la ciudad en la que terminan y el traslado queda marcado', () => {
  const segs = segments();
  const { groups } = groupPlacesByItineraryDay([], segs);
  const cityGroups = cityDayGroups(groups, itineraryAssignmentsByDay(segs));

  assert.deepEqual(cityGroups.map((group) => [group.destination.name, group.days.length]), [
    ['Madrid', 2],
    ['Lisboa', 3],
  ]);
  const transferDay = cityGroups[1].days[0];
  assert.equal(transferDay.transfer, true);
  assert.equal(transferDay.from.name, 'Madrid');
  assert.equal(transferDay.to.name, 'Lisboa');
});

test('el día que se abre es hoy si cae en el viaje; si no, el primero con lugares', () => {
  const segs = segments();
  const { groups } = groupPlacesByItineraryDay([place('x', 'mad', 1)], segs);

  assert.equal(defaultOpenDay(groups, '2026-12-03'), 3);
  assert.equal(defaultOpenDay(groups, '2026-01-01'), 1);
  assert.equal(defaultOpenDay([], '2026-01-01'), null);
});

test('cada país conserva un único color en orden del itinerario', () => {
  const colors = placeCountryColors(segments(), []);
  assert.equal(colors.size, 2);
  assert.notEqual(colors.get('ES'), colors.get('PT'));
});

test('el resumen del día suma solo los tramos con datos', () => {
  const list = [{ id: 'a' }, { id: 'b' }, { id: 'c' }];
  const routes = { 'a>b': { distance: 650, duration: 540 }, 'b>c': null };
  const totals = dayRouteTotals(list, (left, right) => routes[`${left.id}>${right.id}`]);

  assert.deepEqual(totals, { distance: 650, duration: 540, legs: 1 });
  assert.equal(formatDistance(650, 'es-MX'), '650 m');
  assert.equal(formatDistance(7400, 'es-MX'), '7.4 km');
  assert.equal(formatDistance(0, 'es-MX'), '');
});

test('la geometría de Google vive en la sesión y completa la ruta guardada sin tocar el viaje', async () => {
  clearLiveRoutesForTests();
  const saved = { fromPlaceId: 'a', toPlaceId: 'b', mode: 'transit', visible: true, geometry: null, distance: 0, duration: 0 };
  assert.equal(withLiveGeometry(saved), saved);

  let calls = 0;
  const loader = async () => {
    calls += 1;
    return { geometry: { type: 'LineString', coordinates: [[0, 0], [1, 1]] }, distance: 900, duration: 600, segments: [] };
  };
  await Promise.all([ensureLiveRoute('a', 'b', 'transit', loader), ensureLiveRoute('a', 'b', 'transit', loader)]);
  assert.equal(calls, 1);

  const merged = withLiveGeometry(saved);
  assert.equal(merged.duration, 600);
  assert.deepEqual(merged.geometry.coordinates, [[0, 0], [1, 1]]);
  assert.equal(saved.geometry, null);

  let failedCalls = 0;
  const failing = async () => {
    failedCalls += 1;
    throw new Error('offline');
  };
  await assert.rejects(ensureLiveRoute('a', 'c', 'drive', failing));
  await assert.rejects(ensureLiveRoute('a', 'c', 'drive', failing));
  assert.equal(failedCalls, 1, 'un fallo no se reintenta en cada render');

  setLiveRoute('a', 'b', 'walk', { geometry: null });
  assert.equal(withLiveGeometry({ ...saved, mode: 'walk' }).geometry, null);
});

test('el trazo dice cómo te mueves: puntos a pie, color de línea con borde y estaciones en transporte', () => {
  const path = [{ lat: 0, lng: 0 }, { lat: 1, lng: 1 }];
  const walk = routeLineLayers(fakeMaps, { kind: 'walk' }, path);
  const transit = routeLineLayers(fakeMaps, { kind: 'transit', color: '#d7262b' }, path);
  const drive = routeLineLayers(fakeMaps, { kind: 'drive' }, path);

  assert.equal(walk.length, 2);
  assert.equal(walk[1].strokeOpacity, 0);
  assert.equal(walk[1].icons[0].icon.path, fakeMaps.SymbolPath.CIRCLE);
  assert.equal(transit[0].strokeColor, '#ffffff');
  assert.equal(transit[1].strokeColor, '#d7262b');
  assert.deepEqual(transit[1].icons.map(({ offset }) => offset), ['0%', '100%']);
  assert.equal(drive[1].strokeColor, '#0e4f63');
  assert.equal(pendingLineLayer(fakeMaps, path).strokeOpacity, 0);
});

test('una ruta con tramos de transporte se dibuja por tramo con distintivo de línea', () => {
  const route = {
    mode: 'transit',
    segments: [
      { kind: 'walk', color: '', label: '', geometry: { coordinates: [[0, 0], [1, 1]] } },
      { kind: 'transit', color: '#d7262b', label: 'L2', geometry: { coordinates: [[1, 1], [2, 2]] } },
      { kind: 'transit', color: '#d7262b', label: 'L2', geometry: { coordinates: [[2, 2], [3, 3]] } },
    ],
  };
  const drawn = routeDrawSegments(route, () => []);

  assert.deepEqual(drawn.map(({ kind, label }) => [kind, label]), [['walk', ''], ['transit', 'L2'], ['transit', 'L2']]);
  assert.deepEqual(transitLineBadges(route), [{ label: 'L2', color: '#d7262b', textColor: '#ffffff', icon: '' }]);
  assert.equal(routeStroke(route).color, '#d7262b');
  assert.equal(routeStroke(null).style, 'dashed');
  assert.deepEqual(
    routeDrawSegments({ mode: 'drive', geometry: { type: 'LineString', coordinates: [[0, 0], [1, 1]] } }, (geometry) => [geometry.coordinates])
      .map(({ kind }) => kind),
    ['drive']
  );
});

test('dos lugares sin ruta se unen con un arco punteado negro, no con una recta', () => {
  const from = { lat: 52.36, lng: 4.88 };
  const to = { lat: 52.37, lng: 4.9 };
  const arc = arcPath(from, to);
  assert.equal(arc.length, 33);
  assert.deepEqual(arc[0], from);
  assert.ok(Math.abs(arc.at(-1).lat - to.lat) < 1e-9 && Math.abs(arc.at(-1).lng - to.lng) < 1e-9);
  const middle = arc[16];
  const straightMiddle = { lat: (from.lat + to.lat) / 2, lng: (from.lng + to.lng) / 2 };
  assert.ok(Math.hypot(middle.lat - straightMiddle.lat, middle.lng - straightMiddle.lng) > 1e-4, 'el centro se separa de la recta');

  const layer = pendingLineLayer(fakeMaps, [from, to]);
  assert.equal(layer.path.length, 33);
  assert.equal(layer.icons[0].icon.strokeColor, '#0b1f2c');
  assert.equal(layer.icons[0].repeat, '8px');
});

test('el itinerario de transporte lista estaciones, tramos y transbordos sin repetir estaciones', () => {
  const steps = [
    { departureStop: 'Brugge Stadsschouwburg', arrivalStop: 'Brugge', departureTime: '2026-12-02T09:37:00Z', arrivalTime: '2026-12-02T09:45:00Z', vehicleType: 'BUS' },
    { departureStop: 'Brugge Station', arrivalStop: 'Gent-Sint-Pieters', departureTime: '2026-12-02T09:58:00Z', arrivalTime: '2026-12-02T10:20:00Z', vehicleType: 'HEAVY_RAIL' },
    { departureStop: 'Gent-Sint-Pieters', arrivalStop: 'Antwerpen-Centraal', departureTime: '2026-12-02T10:27:00Z', arrivalTime: '2026-12-02T11:23:00Z', vehicleType: 'HEAVY_RAIL' },
  ];
  const items = transitItinerary(steps);

  assert.deepEqual(items.map(({ type, name, walk }) => [type, name || (walk ? 'walk' : '')]), [
    ['stop', 'Brugge Stadsschouwburg'],
    ['ride', ''],
    ['stop', 'Brugge'],
    ['transfer', 'walk'],
    ['stop', 'Brugge Station'],
    ['ride', ''],
    ['stop', 'Gent-Sint-Pieters'],
    ['transfer', ''],
    ['ride', ''],
    ['stop', 'Antwerpen-Centraal'],
  ]);
  assert.equal(items[1].seconds, 8 * 60);
  assert.equal(items[3].seconds, 13 * 60);
  assert.equal(transitVehicleKey('HEAVY_RAIL'), 'transitVehicleTrain');
  assert.equal(transitVehicleKey('SUBWAY'), 'transitVehicleSubway');
  assert.equal(transitVehicleKey('ROCKET'), '');
});
