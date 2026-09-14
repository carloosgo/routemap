// test-contract: behavior
import test from 'node:test';
import assert from 'node:assert/strict';
import { renderItineraryHybridPdf } from '../../src/modules/export/itineraryPdfHybrid.js';

const TRANSLATIONS = {
  itinerary: 'Itinerario',
  tripDates: 'Fechas del viaje',
  grandTotal: 'Total del viaje',
  countries: 'Países',
  country: 'País',
  cities: 'Ciudades',
  totalNights: 'Noches totales',
  notes: 'Notas',
  city: 'Ciudad',
  unnamedTrip: 'Sin nombre',
  noTripDates: 'Sin fechas',
};

const t = (key) => TRANSLATIONS[key] || key;

const model = {
  name: 'Viaje Europa',
  currency: 'USD',
  total: 900,
  summary: {
    startDate: '2026-12-01',
    endDate: '2026-12-03',
    countries: 2,
    destinations: 2,
    nights: 2,
  },
  hasOrigin: false,
  origin: {},
  stops: [
    {
      number: 1,
      color: '#d94f4f',
      name: 'París',
      countryCode: 'FR',
      startDate: '2026-12-01',
      endDate: '2026-12-01',
      total: 300,
      note: 'Llegar temprano.',
    },
    {
      number: 2,
      color: '#3f74d8',
      name: 'Gante',
      countryCode: 'BE',
      startDate: '2026-12-02',
      endDate: '2026-12-02',
      total: 600,
      note: 'Hospedaje en Gante.',
    },
  ],
};

test('el PDF conserva texto vectorial e incrusta solo el mapa como JPEG', () => {
  const bytes = renderItineraryHybridPdf({
    model,
    mapImage: {
      bytes: Uint8Array.from([0xff, 0xd8, 0xff, 0xd9]),
      pixelWidth: 1440,
      pixelHeight: 1240,
    },
    intlLocale: 'es-MX',
    t,
  });
  const source = new globalThis.TextDecoder('windows-1252').decode(bytes);
  assert.match(source, /\/Subtype \/Image/);
  assert.match(source, /\(Viaje Europa\)/);
  assert.match(source, /\(París\)/);
  assert.match(source, /\(Gante\)/);
  assert.doesNotMatch(source, /ItineraryMap.*JPEG/i);
});