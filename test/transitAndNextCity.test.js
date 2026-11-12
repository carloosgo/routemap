// test-contract: behavior
import test from 'node:test';
import assert from 'node:assert/strict';

import { chooseTransitRoute, preferRailRoute, routeTransferStats, transitEffort, routeSegments, routeUsesBus, routeWalkSeconds, transitIconUri } from '../functions/googleOptimizedRouteFunction.js';
import { normalizeRouteSegments, normalizeTransitIcon, createSavedPlaceRoute } from '../src/modules/routes/routeModel.js';
import { transitLineBadges } from '../src/modules/places/routeConnectionStyle.js';
import { cityTransfers, transferDepartureTime } from '../src/modules/places/cityTransferModel.js';

// Polilínea codificada de ejemplo de la documentación de Google (2 puntos).
const LINE_A = '_p~iF~ps|U_ulLnnqC';

test('la ruta de transporte se divide en tramos con el color oficial de cada línea', () => {
  const segments = routeSegments({
    legs: [{
      steps: [
        { travelMode: 'WALK', polyline: { encodedPolyline: LINE_A } },
        { travelMode: 'WALK', polyline: { encodedPolyline: LINE_A } },
        {
          travelMode: 'TRANSIT',
          polyline: { encodedPolyline: LINE_A },
          transitDetails: { transitLine: { color: '#FFCE00', nameShort: 'M1' } },
        },
        {
          travelMode: 'TRANSIT',
          polyline: { encodedPolyline: LINE_A },
          transitDetails: { transitLine: { color: 'red', name: 'Bus 24' } },
        },
      ],
    }],
  });

  assert.deepEqual(segments.map(({ kind, color, label }) => [kind, color, label]), [
    ['walk', '', ''],
    ['transit', '#FFCE00', 'M1'],
    ['transit', '', 'Bus 24'],
  ]);
  assert.equal(segments[0].geometry.coordinates.length, 3);
});

test('cada tramo de transporte lleva el logo de su línea y el color de texto oficial', () => {
  const segments = routeSegments({
    legs: [{
      steps: [{
        travelMode: 'TRANSIT',
        polyline: { encodedPolyline: LINE_A },
        transitDetails: {
          transitLine: {
            color: '#FFCE00',
            textColor: '#000000',
            nameShort: 'M1',
            iconUri: '//maps.gstatic.com/mapfiles/transit/iw2/svg/fr-paris-metro.svg',
          },
        },
      }, {
        travelMode: 'TRANSIT',
        polyline: { encodedPolyline: LINE_A },
        transitDetails: { transitLine: { nameShort: 'IC', iconUri: 'https://evil.example/logo.png' } },
      }],
    }],
  });

  assert.equal(segments[0].icon, 'https://maps.gstatic.com/mapfiles/transit/iw2/svg/fr-paris-metro.svg');
  assert.equal(segments[0].textColor, '#000000');
  assert.equal(segments[1].icon, '', 'solo se aceptan logos de dominios de Google');
  assert.equal(transitIconUri('javascript:alert(1)'), '');
  assert.equal(normalizeTransitIcon('http://maps.gstatic.com/x.png'), '');

  const [stored] = normalizeRouteSegments([segments[0]]);
  assert.equal(stored.icon, segments[0].icon);
  assert.deepEqual(transitLineBadges({ segments: [stored] }), [
    { label: 'M1', color: '#FFCE00', textColor: '#000000', icon: segments[0].icon },
  ]);
});

test('una ruta sin transporte público no genera tramos', () => {
  assert.deepEqual(routeSegments({ legs: [{ steps: [{ travelMode: 'DRIVE', polyline: { encodedPolyline: LINE_A } }] }] }), []);
});

test('el modelo de rutas conserva tramos válidos y descarta los incompletos', () => {
  const segments = normalizeRouteSegments([
    { kind: 'transit', color: '#00a0e2', label: 'U2', geometry: { coordinates: [[13.4, 52.5], [13.41, 52.51]] } },
    { kind: 'hack', color: 'javascript:alert(1)', geometry: { coordinates: [[1, 1], [2, 2]] } },
    { kind: 'walk', geometry: { coordinates: [[1, 1]] } },
  ]);

  assert.equal(segments.length, 2);
  assert.equal(segments[1].kind, 'other');
  assert.equal(segments[1].color, '');
  assert.equal(createSavedPlaceRoute({ segments }).segments.length, 2);
});

test('el día de traslado genera una tarjeta por cada cambio de ciudad', () => {
  const paris = { id: 'paris', name: 'Paris', lat: 48.85, lon: 2.35 };
  const london = { id: 'london', name: 'London', lat: 51.5, lon: -0.12 };
  const transfers = cityTransfers([
    { segmentId: 'a', destination: paris },
    { segmentId: 'b', destination: london },
  ]);

  assert.deepEqual(transfers.map(({ key, from, to }) => [key, from.name, to.name]), [['a>b', 'Paris', 'London']]);
  assert.deepEqual(cityTransfers([{ segmentId: 'a', destination: paris }, { segmentId: 'b', destination: paris }]), []);
});

test('la salida de referencia es a las 9 de la mañana locales y solo en fechas futuras', () => {
  const now = Date.parse('2026-11-05T00:00:00Z');
  assert.equal(transferDepartureTime('2026-12-23', 2.35, now), '2026-12-23T09:00:00.000Z');
  assert.equal(transferDepartureTime('2026-12-23', -99.13, now), '2026-12-23T16:00:00.000Z');
  assert.equal(transferDepartureTime('2026-01-01', 0, now), '');
  assert.equal(transferDepartureTime('no-date', 0, now), '');
});

test('en transporte público se prefiere metro o tren si no tarda mucho más que el bus', () => {
  const busRoute = {
    duration: '1800s',
    legs: [{ steps: [{ travelMode: 'TRANSIT', transitDetails: { transitLine: { vehicle: { type: 'BUS' } } } }] }],
  };
  const metroRoute = {
    duration: '2100s',
    legs: [{ steps: [{ travelMode: 'TRANSIT', transitDetails: { transitLine: { vehicle: { type: 'SUBWAY' } } } }] }],
  };
  const slowTrain = { ...metroRoute, duration: '4000s' };

  assert.equal(routeUsesBus(busRoute), true);
  assert.equal(routeUsesBus(metroRoute), false);
  assert.equal(preferRailRoute(busRoute, metroRoute), metroRoute);
  assert.equal(preferRailRoute(busRoute, slowTrain), busRoute, 'no a costa de tardar mucho más');
  assert.equal(preferRailRoute(busRoute, null), busRoute);
});

test('transporte: entre alternativas parecidas gana la que evita una caminata larga al final', () => {
  const walk = (seconds) => ({ travelMode: 'WALK', staticDuration: `${seconds}s` });
  const ride = { travelMode: 'TRANSIT', staticDuration: '600s' };
  // Metro y luego 15 min caminando (lo que Google da por defecto, 25 min).
  const longWalk = { duration: '1500s', legs: [{ steps: [walk(120), ride, walk(900)] }] };
  // Metro + otra línea hasta una estación cerca del destino (27 min).
  const transfer = { duration: '1620s', legs: [{ steps: [walk(120), ride, { ...ride }, walk(180)] }] };
  // Mucho más lenta: no compensa aunque camine poco.
  const slow = { duration: '3600s', legs: [{ steps: [walk(60), ride] }] };

  assert.equal(routeWalkSeconds(longWalk), 1020);
  assert.equal(routeWalkSeconds({ legs: [{ steps: [{ travelMode: 'WALK', distanceMeters: 130 }] }] }), 100);
  assert.equal(chooseTransitRoute(longWalk, [transfer, slow]), transfer);
  assert.equal(chooseTransitRoute(longWalk, [slow]), longWalk, 'no a costa de tardar mucho más');
  assert.equal(chooseTransitRoute(transfer, [longWalk]), transfer);
  assert.equal(chooseTransitRoute(null, [transfer]), transfer);
});

test('transporte: evita transbordos caminando entre estaciones distintas (RER + caminar + metro)', () => {
  const walk = (seconds) => ({ travelMode: 'WALK', staticDuration: `${seconds}s` });
  const ride = (seconds) => ({ travelMode: 'TRANSIT', staticDuration: `${seconds}s` });
  // Étoile → RER A → Auber, caminar 6 min a Opéra, línea 8 (22 min).
  const rerWalk = { duration: '1320s', legs: [{ steps: [walk(180), ride(180), walk(360), ride(480), walk(120)] }] };
  // Étoile → línea 1 → Concorde, transbordo en la estación, línea 8 (24 min).
  const metro = { duration: '1440s', legs: [{ steps: [walk(180), ride(600), walk(90), ride(300), walk(120)] }] };

  assert.deepEqual(routeTransferStats(rerWalk), { transfers: 1, walkSeconds: 240 });
  assert.deepEqual(routeTransferStats(metro), { transfers: 1, walkSeconds: 0 });
  assert.equal(chooseTransitRoute(rerWalk, [metro]), metro);
  assert.ok(transitEffort(metro) < transitEffort(rerWalk));
});
