// test-contract: behavior
import test from 'node:test';
import assert from 'node:assert/strict';

import {
  groupPlacesByPlanningDay,
  planningGroupKey,
  segmentPlanningDayCount,
  tripPlanningDays,
} from '../src/modules/trips/tripDayPlanning.js';
import { createPlace, createSegment } from '../src/modules/trips/tripModel.js';

function city(id, name, country, countryCode, lat, lon) {
  return { id, name, displayName: `${name}, ${country}`, country, countryCode, lat, lon };
}

const reykjavik = city('reykjavik', 'Reykjavik', 'Iceland', 'IS', 64.1466, -21.9426);
const berlin = city('berlin', 'Berlin', 'Germany', 'DE', 52.52, 13.405);
const london = city('london', 'London', 'United Kingdom', 'GB', 51.5074, -0.1278);

test('Reykjavik del 2 al 4 de septiembre produce tres días civiles consecutivos', () => {
  const segment = createSegment({
    id: 'islandia',
    destination: reykjavik,
    startDate: '2026-09-02',
    endDate: '2026-09-04',
  });

  assert.equal(segmentPlanningDayCount(segment), 3);
  assert.deepEqual(
    tripPlanningDays([segment]).map(({ date, globalDayNumber, dayOffset }) => ({
      date,
      globalDayNumber,
      dayOffset,
    })),
    [
      { date: '2026-09-02', globalDayNumber: 1, dayOffset: 0 },
      { date: '2026-09-03', globalDayNumber: 2, dayOffset: 1 },
      { date: '2026-09-04', globalDayNumber: 3, dayOffset: 2 },
    ]
  );
});

test('los números de día son globales y dos ciudades pueden compartir el mismo día civil', () => {
  const days = tripPlanningDays([
    createSegment({
      id: 'islandia',
      destination: reykjavik,
      startDate: '2026-09-02',
      endDate: '2026-09-04',
    }),
    createSegment({
      id: 'alemania',
      destination: berlin,
      startDate: '2026-09-05',
      endDate: '2026-09-06',
    }),
    createSegment({
      id: 'reinounido',
      destination: london,
      startDate: '2026-09-06',
      endDate: '2026-09-06',
    }),
  ]);

  const berlinStart = days.find((day) => day.segmentId === 'alemania' && day.dayOffset === 0);
  const berlinEnd = days.find((day) => day.segmentId === 'alemania' && day.dayOffset === 1);
  const londonDay = days.find((day) => day.segmentId === 'reinounido');

  assert.equal(berlinStart.globalDayNumber, 4);
  assert.equal(berlinEnd.globalDayNumber, 5);
  assert.equal(londonDay.globalDayNumber, 5);
  assert.equal(berlinEnd.date, londonDay.date);
});

test('rangos incompletos, inválidos o sin destino no crean días organizables', () => {
  const segments = [
    createSegment({ id: 'sin-destino', startDate: '2026-09-02', endDate: '2026-09-03' }),
    createSegment({ id: 'sin-fin', destination: reykjavik, startDate: '2026-09-02' }),
    createSegment({ id: 'invertido', destination: berlin, startDate: '2026-09-05', endDate: '2026-09-04' }),
  ];

  assert.deepEqual(tripPlanningDays(segments), []);
});

test('el cálculo usa fechas civiles sin deriva por DST, fin de mes ni huso horario', () => {
  const days = tripPlanningDays([
    createSegment({
      id: 'dst',
      destination: berlin,
      startDate: '2026-10-24',
      endDate: '2026-11-02',
    }),
  ]);

  assert.equal(days.length, 10);
  assert.equal(days[0].date, '2026-10-24');
  assert.equal(days[8].date, '2026-11-01');
  assert.equal(days[9].date, '2026-11-02');
  assert.equal(days[9].globalDayNumber, 10);
});

test('los lugares se agrupan por segmentId + dayOffset y el legado queda por organizar', () => {
  const segments = [
    createSegment({
      id: 'islandia',
      destination: reykjavik,
      startDate: '2026-09-02',
      endDate: '2026-09-03',
    }),
  ];
  const places = [
    createPlace({ id: 'p1', name: 'Hallgrímskirkja', lat: 64.1417, lon: -21.9266, segmentId: 'islandia', dayOffset: 0 }),
    createPlace({ id: 'p2', name: 'Harpa', lat: 64.1502, lon: -21.9325, segmentId: 'islandia', dayOffset: 1 }),
    createPlace({ id: 'legacy', name: 'Legacy', lat: 64.14, lon: -21.9 }),
  ];
  const grouped = groupPlacesByPlanningDay(places, segments);

  assert.equal(grouped.groups.length, 2);
  assert.deepEqual(grouped.groups[0].places.map((place) => place.id), ['p1']);
  assert.deepEqual(grouped.groups[1].places.map((place) => place.id), ['p2']);
  assert.deepEqual(grouped.unassigned.map((place) => place.id), ['legacy']);
  assert.equal(grouped.groups[0].key, planningGroupKey('islandia', 0));
});
