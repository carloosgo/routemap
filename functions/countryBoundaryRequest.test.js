import test from 'node:test';
import assert from 'node:assert/strict';
import {
  COUNTRY_BOUNDARY_CACHE_VERSION,
  COUNTRY_BOUNDARY_GEOMETRY_SOURCE,
  countryBoundaryCacheKey,
  countryBoundaryDownloadUrls,
  countryBoundaryMetadataUrl,
} from './countryBoundaryRequest.js';

test('builds the gbOpen ADM0 metadata URL from ISO-3', () => {
  assert.equal(
    countryBoundaryMetadataUrl('fra'),
    'https://www.geoboundaries.org/api/current/gbOpen/FRA/ADM0/'
  );
  assert.equal(countryBoundaryMetadataUrl('FR'), '');
});

test('accepts only geoBoundaries repository download URLs', () => {
  const urls = countryBoundaryDownloadUrls({
    gjDownloadURL:
      'https://github.com/wmgeolab/geoBoundaries/raw/9469f09/releaseData/gbOpen/FRA/ADM0/geoBoundaries-FRA-ADM0.geojson',
  });

  assert.equal(urls.length, 2);
  assert.equal(urls[0].includes('/wmgeolab/geoBoundaries/'), true);
  assert.equal(urls[1].startsWith('https://media.githubusercontent.com/media/'), true);
  assert.deepEqual(
    countryBoundaryDownloadUrls({ gjDownloadURL: 'https://example.com/country.geojson' }),
    []
  );
});

test('changes cache namespace so maritime and simplified polygons cannot be reused', () => {
  assert.equal(COUNTRY_BOUNDARY_GEOMETRY_SOURCE, 'geoBoundaries.gbOpen.ADM0.full');
  assert.equal(COUNTRY_BOUNDARY_CACHE_VERSION, 'v5');
  assert.equal(
    countryBoundaryCacheKey('fr'),
    'country-boundary:v5:geoBoundaries.gbOpen.ADM0.full:FR'
  );
});
