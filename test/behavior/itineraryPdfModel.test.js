// test-contract: behavior
import test from 'node:test';
import assert from 'node:assert/strict';
import { colorForIndex } from '../../src/config.js';
import { buildItineraryPdfModel } from '../../src/modules/export/itineraryPdfModel.js';
import { tripTotal } from '../../src/modules/trips/tripModel.js';
import { tripSummary } from '../../src/modules/trips/tripSummaryModel.js';

const mexicoCity = {
  id: 'mexico-city',
  name: 'Ciudad de México',
  country: 'México',
  countryCode: 'MX',
  lat: 19.4326,
  lon: -99.1332,
};
const paris = {
  id: 'paris',
  name: 'París',
  country: 'Francia',
  countryCode: 'FR',
  lat: 48.8566,
  lon: 2.3522,
};
const nuremberg = {
  id: 'nuremberg',
  name: 'Núremberg',
  country: 'Alemania',
  countryCode: 'DE',
  lat: 49.4521,
  lon: 11.0767,
};

const trip = {
  id: 'europe-2026',
  name: 'Europa 2026',
  currency: 'EUR',
  origin: mexicoCity,
  originDetails: {
    departureDate: '2026-12-01',
    note: 'Llegar tres horas antes.\nDocumentos en la mochila.',
  },
  segments: [
    {
      id: 's1',
      origin: mexicoCity,
      destination: paris,
      startDate: '2026-12-02',
      endDate: '2026-12-03',
      note: 'Primera visita a París.',
    },
    {
      id: 's2',
      origin: paris,
      destination: nuremberg,
      startDate: '2026-12-04',
      endDate: '2026-12-05',
      note: 'Base para Franconia.',
    },
    {
      id: 's3',
      origin: nuremberg,
      destination: paris,
      startDate: '2026-12-06',
      endDate: '2026-12-07',
      note: 'Segunda visita a París.',
    },
  ],
};

test('conserva el orden cronológico y las visitas repetidas para el PDF', () => {
  const model = buildItineraryPdfModel(trip);

  assert.deepEqual(model.stops.map((stop) => stop.number), [1, 2, 3]);
  assert.deepEqual(model.stops.map((stop) => stop.name), ['París', 'Núremberg', 'París']);
  assert.deepEqual(model.stops.map((stop) => stop.color), [
    colorForIndex(0),
    colorForIndex(1),
    colorForIndex(2),
  ]);
  assert.equal(model.stops[0].note, 'Primera visita a París.');
  assert.equal(model.stops[2].note, 'Segunda visita a París.');
});

test('conserva el mismo orden y colores canónicos de países que el mapa de Itinerario', () => {
  const model = buildItineraryPdfModel(trip);

  assert.deepEqual(model.countries.map((country) => country.countryCode), ['FR', 'DE']);
  assert.deepEqual(model.countries.map((country) => country.color), [
    colorForIndex(0),
    colorForIndex(1),
  ]);
  assert.deepEqual(model.countries.map((country) => country.city.name), ['París', 'Núremberg']);
});

test('incluye la nota de origen sin alterar sus saltos de línea', () => {
  const model = buildItineraryPdfModel(trip);

  assert.equal(model.hasOrigin, true);
  assert.equal(model.origin.name, 'Ciudad de México');
  assert.equal(model.origin.departureDate, '2026-12-01');
  assert.equal(model.origin.note, 'Llegar tres horas antes.\nDocumentos en la mochila.');
});

test('omite por completo el origen cuando el usuario no seleccionó uno', () => {
  const model = buildItineraryPdfModel({
    ...trip,
    origin: null,
    originDetails: {
      departureDate: '',
      note: '',
    },
    segments: [
      { ...trip.segments[0], origin: null },
      ...trip.segments.slice(1),
      { id: 'empty', destination: null, startDate: '', endDate: '', note: '' },
    ],
  });

  assert.equal(model.hasOrigin, false);
  assert.equal(model.origin.name, '');
  assert.deepEqual(model.stops.map((stop) => stop.name), ['París', 'Núremberg', 'París']);
  assert.deepEqual(model.stops.map((stop) => stop.number), [1, 2, 3]);
});

test('reutiliza las mismas métricas y total que el encabezado del viaje', () => {
  const model = buildItineraryPdfModel(trip);

  assert.deepEqual(model.summary, tripSummary(trip));
  assert.equal(model.total, tripTotal(trip));
  assert.equal(model.currency, 'EUR');
});
