// test-contract: architecture
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const root = new URL('../', import.meta.url);
const read = (path) => readFile(new URL(path, root), 'utf8');

test('la búsqueda activa de ciudades no depende del antiguo catálogo Atlas', async () => {
  const backend = await read('functions/geoapifyCityFunctions.js');
  const client = await read('src/modules/geocoding/citySearchClient.js');
  const hook = await read('src/modules/geocoding/useCitySearch.js');

  assert.match(backend, /cached\('citySearchCache'/);
  assert.match(backend, /buildGeoapifyCitySearchUrl/);
  assert.match(backend, /source: cacheHit\.hit \? 'provider-cache' : 'provider'/);
  assert.doesNotMatch(backend, /readCityCatalogQuery|persistCityCatalogQuery|readCitySearchCatalogProjection|writeCitySearchCatalogProjection/);
  assert.doesNotMatch(backend, /cityCatalogProviderRefs|cityCatalogQueries|collection\('cityCatalog'\)/);

  assert.match(client, /firebaseCallable\('geoapifyCityAutocomplete'\)/);
  assert.match(hook, /getGeocoder\(\)\.search/);
  assert.doesNotMatch(client, /cityCatalog/);
  assert.doesNotMatch(hook, /cityCatalog/);
});

test('la ciudad persistible conserva sólo el contrato canónico y descarta metadatos de proveedor', async () => {
  const client = await read('src/modules/geocoding/citySearchClient.js');
  const canonicalBlock = client.slice(
    client.indexOf('export function canonicalCityFromSearchResult'),
    client.indexOf('export function createGeoapifyCityProvider')
  );

  assert.match(canonicalBlock, /id:/);
  assert.match(canonicalBlock, /name:/);
  assert.match(canonicalBlock, /displayName:/);
  assert.match(canonicalBlock, /country:/);
  assert.match(canonicalBlock, /countryCode:/);
  assert.match(canonicalBlock, /lat:/);
  assert.match(canonicalBlock, /lon:/);
  assert.doesNotMatch(canonicalBlock, /region:/);
  assert.doesNotMatch(canonicalBlock, /regionCode:/);
  assert.doesNotMatch(canonicalBlock, /source:/);
});

test('la caché de búsqueda sigue siendo técnica, descartable y sensible a idioma/límite', async () => {
  const backend = await read('functions/geoapifyCityFunctions.js');
  const client = await read('src/modules/geocoding/citySearchClient.js');
  const cache = await read('src/modules/geocoding/citySearchCache.js');

  assert.match(backend, /city:v8:\$\{queryKey\}:lang=\$\{language\}:limit=\$\{MAX_RESULTS\}/);
  assert.match(client, /`\$\{queryKey\}\|\$\{safeLanguage\}\|\$\{safeLimit\}`/);
  assert.match(cache, /atlas:geoapify-city-cache:v8/);
  assert.match(client, /CANONICAL_CACHE_SOURCES/);
  assert.doesNotMatch(cache, /firestore|cityCatalog/);
});
