// test-contract: architecture
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

test('city search v8 usa catálogo Atlas antes de Geoapify y versiona ambos caches', async () => {
  const [functionSource, utilSource, catalogSource, clientCacheSource] = await Promise.all([
    readFile('functions/geoapifyCityFunctions.js', 'utf8'),
    readFile('functions/geoapifyCityUtils.js', 'utf8'),
    readFile('functions/cityCatalog.js', 'utf8'),
    readFile('src/modules/geocoding/citySearchCache.js', 'utf8'),
  ]);

  assert.match(utilSource, /\/v1\/geocode\/search/);
  assert.match(utilSource, /countrycode:none/);
  assert.doesNotMatch(utilSource, /\/v1\/geocode\/autocomplete/);
  assert.match(utilSource, /address_line1/);
  assert.match(utilSource, /formatted/);
  assert.match(utilSource, /name_international/);
  assert.match(functionSource, /readCityCatalogQuery/);
  assert.match(functionSource, /persistCityCatalogQuery/);
  assert.match(functionSource, /catalogLookup\.status === 'fresh'/);
  assert.match(functionSource, /catalogLookup\.status === 'stale'/);
  assert.match(functionSource, /city:v8:/);
  assert.match(functionSource, /includeRegionMetadata:\s*true/);
  assert.match(catalogSource, /cityCatalog/);
  assert.match(catalogSource, /cityCatalogProviderRefs/);
  assert.match(catalogSource, /cityCatalogQueries/);
  assert.match(catalogSource, /180 \* 24 \* 60 \* 60 \* 1000/);
  assert.match(clientCacheSource, /geoapify-city-cache:v8/);
});

test('el catálogo usa IDs Atlas opacos y conserva provider refs fuera del City de Storage v4', async () => {
  const [catalogSource, clientSource, autocompleteSource, rulesSource] = await Promise.all([
    readFile('functions/cityCatalog.js', 'utf8'),
    readFile('src/modules/geocoding/citySearchClient.js', 'utf8'),
    readFile('src/components/CityAutocomplete.jsx', 'utf8'),
    readFile('firestore.rules', 'utf8'),
  ]);

  assert.match(catalogSource, /collection\(CITY_CATALOG_COLLECTIONS\.cities\)\.doc\(\)/);
  assert.match(catalogSource, /providerRefs/);
  assert.match(catalogSource, /id: cityRef\.id/);
  assert.match(clientSource, /canonicalCityFromSearchResult/);
  assert.match(autocompleteSource, /canonicalCityFromSearchResult\(city\)/);
  assert.match(rulesSource, /'id', 'name', 'displayName', 'country', 'countryCode', 'lat', 'lon'/);
  assert.doesNotMatch(clientSource, /providerRefs|sourceAttribution|verifiedAt|revalidateAfter/);
});
