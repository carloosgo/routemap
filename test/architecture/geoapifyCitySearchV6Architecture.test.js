import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

test('city search v7 usa Geocoding Search neutral, localización y versiona ambos caches', async () => {
  const [functionSource, utilSource, clientCacheSource] = await Promise.all([
    readFile('functions/geoapifyCityFunctions.js', 'utf8'),
    readFile('functions/geoapifyCityUtils.js', 'utf8'),
    readFile('src/modules/geocoding/citySearchCache.js', 'utf8'),
  ]);

  assert.match(utilSource, /\/v1\/geocode\/search/);
  assert.match(utilSource, /countrycode:none/);
  assert.doesNotMatch(utilSource, /\/v1\/geocode\/autocomplete/);
  assert.match(utilSource, /address_line1/);
  assert.match(utilSource, /formatted/);
  assert.match(utilSource, /name_international/);
  assert.match(functionSource, /city:v7:/);
  assert.match(functionSource, /includeRegionMetadata:\s*true/);
  assert.match(clientCacheSource, /geoapify-city-cache:v7/);
});

test('la metadata regional de sugerencia se elimina antes de persistir City', async () => {
  const [clientSource, autocompleteSource] = await Promise.all([
    readFile('src/modules/geocoding/citySearchClient.js', 'utf8'),
    readFile('src/components/CityAutocomplete.jsx', 'utf8'),
  ]);

  assert.match(clientSource, /canonicalCityFromSearchResult/);
  assert.match(autocompleteSource, /canonicalCityFromSearchResult\(city\)/);
});
