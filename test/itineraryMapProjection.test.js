import test from 'node:test';
import assert from 'node:assert/strict';
import {
  itineraryMapProjection,
  itineraryMapProjectionSignature,
} from '../src/modules/map/itineraryMapProjection.js';

function sampleSegment() {
  return {
    id: 'segment-1',
    origin: {
      id: 'mx-cdmx',
      name: 'Ciudad de México',
      country: 'México',
      countryCode: 'MX',
      lat: 19.4326,
      lon: -99.1332,
    },
    destination: {
      id: 'pt-opo',
      name: 'Oporto',
      country: 'Portugal',
      countryCode: 'PT',
      lat: 41.1579,
      lon: -8.6291,
    },
    startDate: '2026-08-14',
    endDate: '2026-08-23',
    expenses: {
      lodging: 4322.22,
      transport: {
        plane: 200,
        train: 34059,
        bus: 0,
        taxiUber: 3,
      },
      attractions: [],
      others: [],
    },
  };
}

test('date and non-route expense edits keep the itinerary map projection stable', () => {
  const original = sampleSegment();
  const edited = structuredClone(original);
  edited.startDate = '2026-08-15';
  edited.endDate = '2026-08-24';
  edited.expenses.lodging = 9999;
  edited.expenses.transport.taxiUber = 100;
  edited.expenses.attractions = [{ id: 'museum', label: 'Museo', amount: 25 }];

  assert.equal(
    itineraryMapProjectionSignature([original]),
    itineraryMapProjectionSignature([edited])
  );
});

test('city geometry changes invalidate the itinerary map projection', () => {
  const original = sampleSegment();
  const edited = structuredClone(original);
  edited.destination.lat = 41.2;

  assert.notEqual(
    itineraryMapProjectionSignature([original]),
    itineraryMapProjectionSignature([edited])
  );
});

test('plane becoming the dominant transport invalidates route styling only when needed', () => {
  const original = sampleSegment();
  const edited = structuredClone(original);
  edited.expenses.transport.plane = 50000;

  assert.notEqual(
    itineraryMapProjectionSignature([original]),
    itineraryMapProjectionSignature([edited])
  );
  assert.equal(itineraryMapProjection([edited])[0].expenses.transport.plane, 1);
});

test('empty city coordinates never become a synthetic 0,0 location', () => {
  const segment = sampleSegment();
  segment.destination.lat = null;
  segment.destination.lon = '';

  const [projected] = itineraryMapProjection([segment]);
  assert.equal(projected.destination.lat, null);
  assert.equal(projected.destination.lon, null);
});
