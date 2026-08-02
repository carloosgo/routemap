import test from 'node:test';
import assert from 'node:assert/strict';
import {
  COUNTRY_BOUNDARY_CACHE_VERSION,
  COUNTRY_BOUNDARY_GEOMETRY_SOURCE,
  countryBoundaryCacheKey,
  countryBoundaryDetailsParams,
  countryBoundaryLookupParams,
} from './countryBoundaryRequest.js';

test('locates the country boundary as a point before requesting full geometry', () => {
  const params = countryBoundaryLookupParams({
    lat: 48.8566,
    lon: 2.3522,
    apiKey: 'test-key',
  });

  assert.equal(params.get('geometry'), 'point');
  assert.equal(params.get('boundaries'), 'administrative');
  assert.equal(params.get('lat'), '48.8566');
  assert.equal(params.get('lon'), '2.3522');
});

test('requests the original geometry from Place Details', () => {
  assert.equal(COUNTRY_BOUNDARY_GEOMETRY_SOURCE, 'details.full_geometry');

  const params = countryBoundaryDetailsParams({
    placeId: 'country-place-id',
    apiKey: 'test-key',
  });

  assert.equal(params.get('id'), 'country-place-id');
  assert.equal(params.get('features'), 'details.full_geometry');
});

test('changes cache namespace so simplified polygons cannot be reused', () => {
  assert.equal(COUNTRY_BOUNDARY_CACHE_VERSION, 'v4');
  assert.equal(
    countryBoundaryCacheKey('fr'),
    'country-boundary:v4:details.full_geometry:FR'
  );
});
