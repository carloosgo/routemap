// test-contract: behavior
import test from 'node:test';
import assert from 'node:assert/strict';
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
  assert.equal(model.stops[0].note, 'Primera visita a París.');
  assert.equal(model.stops[2].note, 'Segunda visita a París.');
});

test('incluye la nota de origen sin alterar sus saltos de línea', () => {
  const model = buildItineraryPdfModel(trip);

  assert.equal(model.origin.name, 'Ciudad de México');
  assert.equal(model.origin.departureDate, '2026-12-01');
  assert.equal(model.origin.note, 'Llegar tres horas antes.\nDocumentos en la mochila.');
});

test('reutiliza las mismas métricas y total que el encabezado del viaje', () => {
  const model = buildItineraryPdfModel(trip);

  assert.deepEqual(model.summary, tripSummary(trip));
  assert.equal(model.total, tripTotal(trip));
  assert.equal(model.currency, 'EUR');
});
