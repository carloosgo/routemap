// test-contract: behavior
import test from 'node:test';
import assert from 'node:assert/strict';

import {
  groupPlacesByTripDay,
  normalizeTripDayOffset,
  placeTripDayOffset,
  tripCalendarDays,
} from '../src/modules/trips/tripGlobalDays.js';
import {
  TRIP_ACTIONS,
  tripReducer,
} from '../src/modules/trips/tripReducer.js';
import {
  createOriginDetails,
  createPlace,
  createSegment,
  createTrip,
} from '../src/modules/trips/tripModel.js';

function city(id, name, country, countryCode, lat, lon) {
  return { id, name, displayName: `${name}, ${country}`, country, countryCode, lat, lon };
}

const frankfurt = city('frankfurt', 'Frankfurt del Meno', 'Alemania', 'DE', 50.1109, 8.6821);
const paris = city('paris', 'París', 'Francia', 'FR', 48.8566, 2.3522);

function calendarTrip() {
  return {
    ...createTrip('Europa'),
    id: 'trip-days',
    origin: frankfurt,
    originDetails: createOriginDetails({ departureDate: '2026-11-30' }),
    segments: [
      createSegment({
        id: 'frankfurt-segment',
        destination: frankfurt,
        startDate: '2026-11-30',
        endDate: '2026-11-30',
      }),
      createSegment({
        id: 'paris-segment',
        destination: paris,
        startDate: '2026-12-01',
        endDate: '2026-12-02',
      }),
    ],
    places: [],
  };
}

test('Mis Rutas proyecta un calendario continuo desde las fechas de Itinerario', () => {
  const days = tripCalendarDays(calendarTrip());
  assert.deepEqual(
    days.map(({ globalDayNumber, date, tripDayOffset }) => ({ globalDayNumber, date, tripDayOffset })),
    [
      { globalDayNumber: 1, date: '2026-11-30', tripDayOffset: 0 },
      { globalDayNumber: 2, date: '2026-12-01', tripDayOffset: 1 },
      { globalDayNumber: 3, date: '2026-12-02', tripDayOffset: 2 },
    ]
  );
});

test('un tripDayOffset ausente no se convierte accidentalmente en Día 1 por Number(null)', () => {
  assert.equal(normalizeTripDayOffset(null), null);
  assert.equal(normalizeTripDayOffset(undefined), null);
  assert.equal(normalizeTripDayOffset(''), null);
});

test('la asignación global explícita manda sobre la fecha local de la ciudad', () => {
  const trip = calendarTrip();
  const place = createPlace({
    id: 'staedel',
    name: 'Museo Städel',
    city: 'Frankfurt del Meno',
    country: 'Alemania',
    countryCode: 'DE',
    lat: 50.1033,
    lon: 8.6739,
    segmentId: 'frankfurt-segment',
    dayOffset: 0,
    tripDayOffset: 2,
  });

  assert.equal(placeTripDayOffset(place, trip), 2);
  const groups = groupPlacesByTripDay(trip, [place]);
  assert.deepEqual(groups[0].places, []);
  assert.deepEqual(groups[2].places.map(({ id }) => id), ['staedel']);
});

test('un lugar legado sin día global aparece en un día y no requiere Por organizar', () => {
  const trip = calendarTrip();
  const legacy = createPlace({
    id: 'legacy',
    name: 'Legacy',
    lat: 50.11,
    lon: 8.68,
  });
  const groups = groupPlacesByTripDay(trip, [legacy]);
  assert.equal(groups.length, 3);
  assert.deepEqual(groups[0].places.map(({ id }) => id), ['legacy']);
});

test('mover un lugar a otro día conserva exactamente su ciudad de origen', () => {
  const trip = calendarTrip();
  trip.places = [createPlace({
    id: 'staedel',
    name: 'Museo Städel',
    city: 'Frankfurt del Meno',
    country: 'Alemania',
    countryCode: 'DE',
    lat: 50.1033,
    lon: 8.6739,
    segmentId: 'frankfurt-segment',
    dayOffset: 0,
    tripDayOffset: 0,
  })];

  const moved = tripReducer(trip, {
    type: TRIP_ACTIONS.movePlaceToDay,
    placeId: 'staedel',
    tripDayOffset: 2,
  });
  const place = moved.places[0];

  assert.equal(place.tripDayOffset, 2);
  assert.equal(place.segmentId, 'frankfurt-segment');
  assert.equal(place.dayOffset, 0);
  assert.equal(place.city, 'Frankfurt del Meno');
  assert.equal(place.country, 'Alemania');
});

test('arrastrar un día mueve todo su contenido como unidad sin cambiar ciudades', () => {
  const trip = calendarTrip();
  trip.places = [
    createPlace({
      id: 'f1', name: 'Frankfurt 1', lat: 50.11, lon: 8.68,
      segmentId: 'frankfurt-segment', dayOffset: 0, tripDayOffset: 0,
    }),
    createPlace({
      id: 'f2', name: 'Frankfurt 2', lat: 50.12, lon: 8.69,
      segmentId: 'frankfurt-segment', dayOffset: 0, tripDayOffset: 0,
    }),
    createPlace({
      id: 'p1', name: 'París 1', lat: 48.85, lon: 2.35,
      segmentId: 'paris-segment', dayOffset: 0, tripDayOffset: 1,
    }),
  ];

  const reordered = tripReducer(trip, {
    type: TRIP_ACTIONS.reorderTripDay,
    sourceTripDayOffset: 0,
    targetTripDayOffset: 1,
    placement: 'after',
  });

  const byId = new Map(reordered.places.map((place) => [place.id, place]));
  assert.equal(byId.get('f1').tripDayOffset, 1);
  assert.equal(byId.get('f2').tripDayOffset, 1);
  assert.equal(byId.get('p1').tripDayOffset, 0);
  assert.equal(byId.get('f1').segmentId, 'frankfurt-segment');
  assert.equal(byId.get('f2').segmentId, 'frankfurt-segment');
  assert.equal(byId.get('p1').segmentId, 'paris-segment');
});

test('dos lugares de ciudades distintas pueden conectarse si están en el mismo día global', () => {
  const trip = calendarTrip();
  trip.places = [
    createPlace({
      id: 'frankfurt-place', name: 'Frankfurt', lat: 50.11, lon: 8.68,
      segmentId: 'frankfurt-segment', dayOffset: 0, tripDayOffset: 1,
    }),
    createPlace({
      id: 'paris-place', name: 'París', lat: 48.85, lon: 2.35,
      segmentId: 'paris-segment', dayOffset: 0, tripDayOffset: 1,
    }),
  ];

  const routed = tripReducer(trip, {
    type: TRIP_ACTIONS.upsertRouteConnection,
    connection: {
      id: 'cross-city',
      fromPlaceId: 'frankfurt-place',
      toPlaceId: 'paris-place',
      mode: 'walk',
      visible: true,
    },
  });

  assert.equal(routed.routeConnections.length, 1);
});

test('reducir la fecha final en Itinerario resta el día y reubica contenido fuera de rango', () => {
  const trip = calendarTrip();
  trip.places = [createPlace({
    id: 'last-day',
    name: 'Último día',
    lat: 48.85,
    lon: 2.35,
    segmentId: 'paris-segment',
    dayOffset: 1,
    tripDayOffset: 2,
  })];

  const shortened = tripReducer(trip, {
    type: TRIP_ACTIONS.updateSegment,
    segmentId: 'paris-segment',
    patch: { endDate: '2026-12-01' },
  });

  assert.equal(shortened.segments[1].endDate, '2026-12-01');
  assert.equal(tripCalendarDays(shortened).length, 2);
  assert.equal(shortened.places[0].tripDayOffset, 1);
  assert.equal(shortened.places[0].segmentId, 'paris-segment');
});
