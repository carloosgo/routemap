import test from 'node:test';
import assert from 'node:assert/strict';
import { buildMapFeatureData } from '../src/modules/map/routeMapModel.js';

const city = (id, lat, lon) => ({
  id,
  name: id.toUpperCase(),
  displayName: id.toUpperCase(),
  country: 'Test',
  countryCode: 'TS',
  lat,
  lon,
});

const colorForIndex = (index) => `color-${index}`;

test('los trazos visibles conservan la numeracion y color canonicos aunque haya un tramo incompleto', () => {
  const a = city('a', 0, 0);
  const b = city('b', 0.1, 0.1);
  const d = city('d', 0.3, 0.3);
  const e = city('e', 0.4, 0.4);
  const segments = [
    { id: 's1', origin: a, destination: b, expenses: {} },
    { id: 's2', origin: b, destination: null, expenses: {} },
    { id: 's3', origin: null, destination: d, expenses: {} },
    { id: 's4', origin: d, destination: e, expenses: {} },
  ];

  const data = buildMapFeatureData({
    segments,
    places: [],
    routeConnections: [],
    viewMode: 'segments',
    colorForIndex,
  });

  assert.deepEqual(
    data.routeFeatures.map((feature) => feature.properties.segmentId),
    ['s1', 's4']
  );
  assert.deepEqual(
    data.routeFeatures.map((feature) => feature.properties.sequence),
    [1, 3]
  );
  assert.deepEqual(
    data.routeFeatures.map((feature) => feature.properties.color),
    ['color-0', 'color-2']
  );
  assert.deepEqual(
    data.cityFeatures.map((feature) => feature.properties.sequence),
    [null, 1, 2, 3]
  );
});
