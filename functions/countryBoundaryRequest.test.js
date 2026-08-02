import test from 'node:test';
import assert from 'node:assert/strict';
import {
  COUNTRY_BOUNDARY_ACCURACY_METERS,
  COUNTRY_BOUNDARY_CACHE_VERSION,
  COUNTRY_BOUNDARY_GEOMETRY,
  countryBoundaryCacheKey,
  countryBoundaryRequestParams,
} from './countryBoundaryRequest.js';

test('requests the highest precision exposed by Geoapify Boundaries API', () => {
  assert.equal(COUNTRY_BOUNDARY_GEOMETRY, 'geometry_1000');
  assert.equal(COUNTRY_BOUNDARY_ACCURACY_METERS, 1000);

  const params = countryBoundaryRequestParams({
    lat: 48.8566,
    lon: 2.3522,
    apiKey: 'test-key',
  });

  assert.equal(params.get('geometry'), 'geometry_1000');
  assert.equal(params.get('boundaries'), 'administrative');
  assert.equal(params.get('lat'), '48.8566');
  assert.equal(params.get('lon'), '2.3522');
});

test('changes the cache namespace so coarse 10 km polygons cannot be reused', () => {
  assert.equal(COUNTRY_BOUNDARY_CACHE_VERSION, 'v3');
  assert.equal(
    countryBoundaryCacheKey('fr'),
    'country-boundary:v3:geometry_1000:FR'
  );
});
