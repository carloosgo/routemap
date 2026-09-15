import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildCountryLandFeature,
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

test('builds one land-only ADM0 feature and preserves every polygon part', () => {
  const payload = {
    type: 'FeatureCollection',
    features: [
      {
        type: 'Feature',
        properties: { shapeGroup: 'FRA', shapeName: 'France' },
        geometry: polygon(6),
      },
      {
        type: 'Feature',
        properties: { shapeGroup: 'FRA', shapeName: 'France' },
        geometry: {
          type: 'MultiPolygon',
          coordinates: [polygon(1).coordinates, polygon(2).coordinates],
        },
      },
    ],
  };

  const feature = buildCountryLandFeature(payload, {
    countryCode: 'FR',
    iso3: 'FRA',
    name: 'France',
  });

  assert.equal(feature.properties.countryCode, 'FR');
  assert.equal(feature.properties.iso3, 'FRA');
  assert.equal(feature.properties.boundaryKind, 'land');
  assert.equal(feature.geometry.type, 'MultiPolygon');
  assert.equal(feature.geometry.coordinates.length, 3);
});

test('does not mix polygon features from another ISO-3 country', () => {
  const feature = buildCountryLandFeature({
    features: [
      {
        type: 'Feature',
        properties: { shapeGroup: 'DEU' },
        geometry: polygon(9),
      },
      {
        type: 'Feature',
        properties: { shapeGroup: 'FRA' },
        geometry: polygon(4),
      },
    ],
  }, { countryCode: 'FR', iso3: 'FRA' });

  assert.deepEqual(feature.geometry, polygon(4));
});

test('rejects payloads without Polygon or MultiPolygon geometries', () => {
  assert.equal(buildCountryLandFeature({
    features: [{
      type: 'Feature',
      properties: {},
      geometry: { type: 'Point', coordinates: [0, 0] },
    }],
  }, { countryCode: 'FR', iso3: 'FRA' }), null);
});

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
    ],
  };

  assert.equal(selectCountryFeature(payload, 'FR').properties.name, 'France');
});

test('compacts a feature without losing polygon coordinates', () => {
  const original = {
    type: 'Feature',
    properties: { country_code: 'es', name: 'Spain', discard: 'x' },
    geometry: polygon(4),
  };

  const compact = compactCountryFeature(original, 'ES');
  assert.deepEqual(compact.geometry, original.geometry);
  assert.equal('discard' in compact.properties, false);
});

test('serializes nested GeoJSON arrays as a Firestore-safe string and restores them', () => {
  const feature = buildCountryLandFeature({
    features: [{
      type: 'Feature',
      properties: { shapeGroup: 'HUN', shapeName: 'Hungary' },
      geometry: polygon(2),
    }],
  }, { countryCode: 'HU', iso3: 'HUN' });

  const encoded = encodeCountryBoundary(feature);
  assert.equal(typeof encoded, 'string');
  assert.ok(utf8ByteLength(encoded) > 0);
  assert.deepEqual(decodeCountryBoundary(encoded), feature);
  assert.equal(isCountryBoundaryFeature(feature), true);
});

test('rejects malformed cached strings', () => {
  assert.equal(decodeCountryBoundary('{not-json'), null);
  assert.equal(isCountryBoundaryFeature(null), false);
});
