import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const root = new URL('../', import.meta.url);

async function read(relativePath) {
  return readFile(new URL(relativePath, root), 'utf8');
}

test('country callable uses full ADM0 land geometry and publishes its source', async () => {
  const requestConfig = await read('functions/countryBoundaryRequest.js');
  const callable = await read('functions/index.js');

  assert.match(
    requestConfig,
    /COUNTRY_BOUNDARY_GEOMETRY_SOURCE = 'geoBoundaries\.gbOpen\.ADM0\.full'/
  );
  assert.match(requestConfig, /COUNTRY_BOUNDARY_CACHE_VERSION = 'v5'/);
  assert.match(requestConfig, /\/api\/current\/gbOpen\/\$\{normalizedIso3\}\/ADM0\//);

  assert.match(callable, /countryBoundaryMetadataUrl\(iso3\)/);
  assert.match(callable, /countryBoundaryDownloadUrls\(metadata\)/);
  assert.match(callable, /buildCountryLandFeature\(payload,/);
  assert.match(callable, /geometrySource: COUNTRY_BOUNDARY_GEOMETRY_SOURCE/);

  assert.doesNotMatch(callable, /geometry_1000|geometry_10000|details\.full_geometry/);
});

test('client rejects non-land geometry and uses the v5 land-boundary cache', async () => {
  const client = await read('src/modules/places/geoapifyClient.js');

  assert.match(client, /atlas:country-land-boundary-cache:v5/);
  assert.match(
    client,
    /BOUNDARY_GEOMETRY_SOURCE = 'geoBoundaries\.gbOpen\.ADM0\.full'/
  );
  assert.match(client, /feature\?\.properties\?\.boundaryKind === 'land'/);
  assert.match(client, /geometrySource !== BOUNDARY_GEOMETRY_SOURCE/);
  assert.match(client, /getCountryLandBoundary/);
});

test('Leaflet renders the land geometry with the requested fill and border without simplification', async () => {
  const coloring = await read('src/modules/map/countryColoring.js');

  assert.match(coloring, /color,/);
  assert.match(coloring, /weight:\s*1\.5/);
  assert.match(coloring, /opacity:\s*0\.5/);
  assert.match(coloring, /fillColor:\s*color/);
  assert.match(coloring, /fillOpacity:\s*0\.18/);
  assert.match(coloring, /smoothFactor:\s*0/);
  assert.match(coloring, /fillRule:\s*'evenodd'/);
});
