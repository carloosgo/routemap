import test from 'node:test';
import assert from 'node:assert/strict';
import {
  compactCountryFeature,
  decodeCountryBoundary,
  encodeCountryBoundary,
  isCountryBoundaryFeature,
  selectCountryFeature,
  utf8ByteLength,
} from './countryBoundaryUtils.js';

function polygon(size = 1) {
  return {
    type: 'Polygon',
    coordinates: [[
      [0, 0],
      [size, 0],
      [size, size],
      [0, size],
      [0, 0],
    ]],
  };
}

test('selects the explicit country feature for the requested ISO code', () => {
  const payload = {
    type: 'FeatureCollection',
    features: [
      {
        type: 'Feature',
        properties: { country_code: 'fr', result_type: 'city', name: 'Paris' },
        geometry: polygon(0.2),
      },
      {
        type: 'Feature',
        properties: { country_code: 'fr', result_type: 'country', name: 'France' },
        geometry: polygon(6),
      },
      {
        type: 'Feature',
        properties: { country_code: 'be', result_type: 'country', name: 'Belgium' },
        geometry: polygon(2),
      },
    ],
  };

  const selected = selectCountryFeature(payload, 'FR');
  assert.equal(selected.properties.name, 'France');
});

test('recognizes administrative level 2 as the national boundary', () => {
  const payload = {
    features: [
      {
        type: 'Feature',
        properties: { country_code: 'de', admin_level: 4, name: 'Bavaria' },
        geometry: polygon(12),
      },
      {
        type: 'Feature',
        properties: { country_code: 'de', admin_level: 2, name: 'Germany' },
        geometry: polygon(8),
      },
    ],
  };

  const selected = selectCountryFeature(payload, 'DE');
  assert.equal(selected.properties.name, 'Germany');
});

test('falls back to the largest polygon when the API omits a country type marker', () => {
  const payload = {
    features: [
      { type: 'Feature', properties: { country_code: 'de' }, geometry: polygon(1) },
      { type: 'Feature', properties: { country_code: 'de' }, geometry: polygon(8) },
    ],
  };

  const selected = selectCountryFeature(payload, 'DE');
  assert.deepEqual(selected.geometry, polygon(8));
});

test('compacts a Geoapify feature without losing polygon coordinates', () => {
  const original = {
    type: 'Feature',
    properties: {
      country_code: 'es',
      result_type: 'country',
      name: 'Spain',
      unnecessaryLargeMetadata: 'discard me',
    },
    geometry: polygon(4),
  };

  const compact = compactCountryFeature(original, 'ES');
  assert.equal(compact.properties.countryCode, 'ES');
  assert.equal(compact.properties.name, 'Spain');
  assert.deepEqual(compact.geometry, original.geometry);
  assert.equal('unnecessaryLargeMetadata' in compact.properties, false);
});

test('serializes nested GeoJSON arrays as a Firestore-safe string and restores them', () => {
  const feature = compactCountryFeature({
    type: 'Feature',
    properties: { country_code: 'hu', name: 'Hungary' },
    geometry: {
      type: 'MultiPolygon',
      coordinates: [[polygon(2).coordinates]],
    },
  }, 'HU');

  const encoded = encodeCountryBoundary(feature);
  assert.equal(typeof encoded, 'string');
  assert.ok(utf8ByteLength(encoded) > 0);

  const decoded = decodeCountryBoundary(encoded);
  assert.deepEqual(decoded, feature);
  assert.equal(isCountryBoundaryFeature(decoded), true);
});

test('rejects malformed cached strings instead of breaking the callable', () => {
  assert.equal(decodeCountryBoundary('{not-json'), null);
  assert.equal(isCountryBoundaryFeature(null), false);
});
