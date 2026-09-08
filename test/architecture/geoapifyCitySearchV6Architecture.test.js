// test-contract: architecture
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

test('city search live consulta Geoapify Search con dos caches técnicas y sin catálogo Atlas activo', async () => {
  const [functionSource, utilSource, clientSource, clientCacheSource] = await Promise.all([
    readFile('functions/geoapifyCityFunctions.js', 'utf8'),
    readFile('functions/geoapifyCityUtils.js', 'utf8'),
    readFile('src/modules/geocoding/citySearchClient.js', 'utf8'),
    readFile('src/modules/geocoding/citySearchCache.js', 'utf8'),
  ]);

  assert.match(utilSource, /\/v1\/geocode\/search/);
  assert.match(utilSource, /countrycode:none/);
  assert.doesNotMatch(utilSource, /\/v1\/geocode\/autocomplete/);
  assert.match(utilSource, /address_line1/);
  assert.match(utilSource, /formatted/);
  assert.match(utilSource, /name_international/);

  assert.match(functionSource, /city:live:v1:/);
  assert.match(functionSource, /cached\(\s*'citySearchCache'/);
  assert.match(functionSource, /source: cachedProvider\.cacheHit \? 'provider-cache' : 'provider'/);
  assert.doesNotMatch(functionSource, /readCityCatalogQuery|persistCityCatalogQuery|cityCatalog/);

  assert.match(clientSource, /getCachedCities\(cacheKey, config\.citySearchCacheTtlMs\)/);
  assert.match(clientSource, /BROWSER_CACHE_SOURCES/);
  assert.match(clientSource, /cacheCities\(cacheKey, results\)/);
  assert.match(clientCacheSource, /geoapify-city-cache:v8/);
});

test('el City canónico de Storage v4 conserva IDs y campos propios sin metadatos de proveedor', async () => {
  const [clientSource, rulesSource, indexSource] = await Promise.all([
    readFile('src/modules/geocoding/citySearchClient.js', 'utf8'),
    readFile('firestore.rules', 'utf8'),
    readFile('functions/index.js', 'utf8'),
  ]);
  const canonicalBlock = clientSource.slice(
    clientSource.indexOf('export function canonicalCityFromSearchResult'),
    clientSource.indexOf('export function sanitizeCitySearchResults')
  );

  assert.match(canonicalBlock, /id:/);
  assert.match(canonicalBlock, /name:/);
  assert.match(canonicalBlock, /displayName:/);
  assert.match(canonicalBlock, /country:/);
  assert.match(canonicalBlock, /countryCode:/);
  assert.match(canonicalBlock, /lat:/);
  assert.match(canonicalBlock, /lon:/);
  assert.doesNotMatch(canonicalBlock, /providerRefs|sourceAttribution|verifiedAt|revalidateAfter|region:/);
  assert.match(rulesSource, /'id', 'name', 'displayName', 'country', 'countryCode', 'lat', 'lon'/);
  assert.match(indexSource, /geoapifyCityAutocomplete/);
  assert.doesNotMatch(indexSource, /cityCatalog/);
});
