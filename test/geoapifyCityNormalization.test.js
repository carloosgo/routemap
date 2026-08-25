import test from 'node:test';
import assert from 'node:assert/strict';

import {
  buildGeoapifyCitySearchUrl,
  normalizeGeoapifyCityResults,
} from '../functions/geoapifyCityUtils.js';
import {
  canonicalCityFromSearchResult,
  sanitizeCitySearchResults,
} from '../src/modules/geocoding/citySearchClient.js';

function city(overrides = {}) {
  return {
    place_id: 'place-default',
    name: 'Example',
    city: 'Example',
    country_code: 'mx',
    country: 'Mexico',
    state: 'Jalisco',
    lat: 20.67,
    lon: -103.35,
    datasource: { raw: {} },
    ...overrides,
  };
}

test('Tokio usa el alias localizado y descarta candidatos sin nombre latino utilizable', () => {
  const results = normalizeGeoapifyCityResults([
    city({
      place_id: 'tokyo',
      name: '東京',
      city: '東京',
      country_code: 'jp',
      country: 'Japan',
      state: 'Tokyo',
      lat: 35.6762,
      lon: 139.6503,
      datasource: { raw: { 'name:es': 'Tokio', 'name:en': 'Tokyo' } },
    }),
    city({
      place_id: 'native-only',
      name: '東洋町',
      city: '東洋町',
      country_code: 'jp',
      country: 'Japan',
      state: '高知県',
      lat: 33.53,
      lon: 134.28,
      datasource: { raw: {} },
    }),
  ], { language: 'es' });

  assert.deepEqual(results.map((result) => result.displayName), ['Tokio, Japón']);
});

test('registros internos distintos de Estambul se colapsan sin usar distancia geográfica', () => {
  const results = normalizeGeoapifyCityResults([
    city({
      place_id: 'istanbul-city',
      name: 'İstanbul',
      city: 'İstanbul',
      country_code: 'tr',
      country: 'Türkiye',
      state: 'İstanbul',
      lat: 41.0082,
      lon: 28.9784,
      datasource: { raw: { 'name:es': 'Estambul', 'name:en': 'Istanbul' } },
    }),
    city({
      place_id: 'istanbul-metro',
      name: 'İstanbul',
      city: 'İstanbul',
      country_code: 'tr',
      country: 'Türkiye',
      state: 'İstanbul',
      lat: 40.88,
      lon: 29.31,
      datasource: { raw: { 'name:es': 'Estambul', 'name:en': 'Istanbul' } },
    }),
    city({
      place_id: 'estambul-bo',
      name: 'Estambul',
      city: 'Estambul',
      country_code: 'bo',
      country: 'Bolivia',
      state: 'Santa Cruz',
      lat: -17.7,
      lon: -63.2,
    }),
    city({
      place_id: 'estambul-co',
      name: 'Estambul',
      city: 'Estambul',
      country_code: 'co',
      country: 'Colombia',
      state: 'Córdoba',
      lat: 8.7,
      lon: -75.9,
    }),
  ], { language: 'es' });

  assert.deepEqual(
    results.map((result) => result.displayName),
    ['Estambul, Turquía', 'Estambul, Bolivia', 'Estambul, Colombia']
  );
  assert.equal(results[0].id, 'istanbul-city');
});

test('homónimos reales del mismo país se conservan y se distinguen por región', () => {
  const results = normalizeGeoapifyCityResults([
    city({
      place_id: 'san-pedro-jalisco',
      name: 'San Pedro',
      city: 'San Pedro',
      state: 'Jalisco',
      lat: 20.5,
      lon: -103.1,
    }),
    city({
      place_id: 'san-pedro-coahuila',
      name: 'San Pedro',
      city: 'San Pedro',
      state: 'Coahuila',
      lat: 25.75,
      lon: -102.98,
    }),
  ], { language: 'es' });

  assert.deepEqual(
    results.map((result) => result.displayName),
    ['San Pedro, Jalisco, México', 'San Pedro, Coahuila, México']
  );
});

test('el cliente elimina etiquetas visibles repetidas pero conserva homónimos desambiguados', () => {
  const results = sanitizeCitySearchResults([
    { name: 'Estambul', displayName: 'Estambul, Turquía', countryCode: 'TR' },
    { name: 'Estambul', displayName: 'Estambul, Turquía', countryCode: 'TR' },
    { name: '東京23区', displayName: '東京23区, Japón', countryCode: 'JP' },
    { name: 'San Pedro', displayName: 'San Pedro, Jalisco, México', countryCode: 'MX' },
    { name: 'San Pedro', displayName: 'San Pedro, Coahuila, México', countryCode: 'MX' },
  ], { language: 'es' });

  assert.deepEqual(
    results.map((result) => result.displayName),
    ['Estambul, Turquía', 'San Pedro, Jalisco, México', 'San Pedro, Coahuila, México']
  );
});

test('la búsqueda de ciudades usa Geocoding Search mundial neutral', () => {
  const url = new URL(buildGeoapifyCitySearchUrl({
    query: 'Berlin',
    language: 'en',
    limit: 99,
    apiKey: 'test-key',
  }));

  assert.equal(url.pathname, '/v1/geocode/search');
  assert.equal(url.searchParams.get('text'), 'Berlin');
  assert.equal(url.searchParams.get('type'), 'city');
  assert.equal(url.searchParams.get('limit'), '5');
  assert.equal(url.searchParams.get('lang'), 'en');
  assert.equal(url.searchParams.get('bias'), 'countrycode:none');
  assert.equal(url.searchParams.get('format'), 'json');
  assert.doesNotMatch(url.pathname, /autocomplete/);
});

test('aliases multilingües colapsan Bruselas aunque cambie el nombre visible', () => {
  const aliases = {
    'name:es': 'Bruselas',
    'name:en': 'Brussels',
    'name:fr': 'Bruxelles',
    'name:nl': 'Brussel',
  };
  const results = normalizeGeoapifyCityResults([
    city({
      place_id: 'brussels-node',
      name: 'Brussels',
      city: 'Brussels',
      country_code: 'be',
      country: 'Belgium',
      state: 'Brussels-Capital',
      state_code: 'BRU',
      lat: 50.8466,
      lon: 4.3528,
      datasource: { raw: aliases },
      rank: {
        confidence: 0.98,
        confidence_city_level: 1,
        match_type: 'full_match',
        importance: 0.82,
        popularity: 0.9,
      },
    }),
    city({
      place_id: 'brussels-boundary',
      name: 'Bruxelles',
      city: 'Bruxelles',
      country_code: 'be',
      country: 'Belgium',
      state: 'BRU',
      state_code: 'BRU',
      lat: 50.8503,
      lon: 4.3517,
      datasource: { raw: aliases },
      rank: {
        confidence: 0.91,
        confidence_city_level: 0.95,
        match_type: 'full_match',
      },
    }),
  ], {
    language: 'es',
    query: 'brus',
    includeRegionMetadata: true,
  });

  assert.equal(results.length, 1);
  assert.equal(results[0].name, 'Bruselas');
  assert.equal(results[0].countryCode, 'BE');
  assert.equal(results[0].region, 'Brussels-Capital');
  assert.equal(results[0].regionCode, 'BRU');
});

test('nombre y código de la misma región son equivalentes para deduplicar París', () => {
  const aliases = { 'name:es': 'París', 'name:en': 'Paris' };
  const results = normalizeGeoapifyCityResults([
    city({
      place_id: 'paris-name-region',
      name: 'Paris',
      city: 'Paris',
      country_code: 'fr',
      country: 'France',
      state: 'Île-de-France',
      state_code: 'IDF',
      lat: 48.8566,
      lon: 2.3522,
      datasource: { raw: aliases },
    }),
    city({
      place_id: 'paris-code-region',
      name: 'Paris',
      city: 'Paris',
      country_code: 'fr',
      country: 'France',
      state: 'IDF',
      state_code: 'IDF',
      lat: 48.86,
      lon: 2.34,
      datasource: { raw: aliases },
    }),
  ], {
    language: 'es',
    query: 'paris',
    includeRegionMetadata: true,
  });

  assert.equal(results.length, 1);
  assert.equal(results[0].name, 'París');
  assert.equal(results[0].region, 'Île-de-France');
  assert.equal(results[0].regionCode, 'IDF');
});

test('confidence claramente insuficiente rechaza una coincidencia textual débil', () => {
  const results = normalizeGeoapifyCityResults([
    city({
      place_id: 'low-confidence',
      name: 'Shanghai',
      city: 'Shanghai',
      country_code: 'cn',
      country: 'China',
      state: 'Shanghai',
      lat: 31.2304,
      lon: 121.4737,
      datasource: { raw: { 'name:en': 'Shanghai' } },
      rank: {
        confidence: 0.1,
        confidence_city_level: 0.1,
        match_type: 'full_match',
      },
    }),
  ], { language: 'es', query: 'shangai' });

  assert.deepEqual(results, []);
});

test('un typo razonable se conserva cuando Geoapify respalda el nivel ciudad', () => {
  const results = normalizeGeoapifyCityResults([
    city({
      place_id: 'shanghai-good-rank',
      name: 'Shanghai',
      city: 'Shanghai',
      country_code: 'cn',
      country: 'China',
      state: 'Shanghai',
      lat: 31.2304,
      lon: 121.4737,
      datasource: { raw: { 'name:en': 'Shanghai' } },
      rank: {
        confidence: 0.8,
        confidence_city_level: 0.9,
        match_type: 'full_match',
      },
    }),
  ], { language: 'es', query: 'shangai' });

  assert.deepEqual(results.map((result) => result.name), ['Shanghai']);
});

test('Atlas conserva el orden del proveedor en lugar de reordenar por popularity localmente', () => {
  const results = normalizeGeoapifyCityResults([
    city({
      place_id: 'san-pedro-first',
      name: 'San Pedro',
      city: 'San Pedro',
      state: 'Jalisco',
      lat: 20.5,
      lon: -103.1,
      rank: { confidence: 0.95, confidence_city_level: 0.95, popularity: 0.1 },
    }),
    city({
      place_id: 'san-jose-second',
      name: 'San José',
      city: 'San José',
      country_code: 'cr',
      country: 'Costa Rica',
      state: 'San José Province',
      lat: 9.9281,
      lon: -84.0907,
      rank: { confidence: 0.99, confidence_city_level: 0.99, popularity: 0.99 },
    }),
  ], { language: 'es', query: 'san' });

  assert.deepEqual(results.map((result) => result.id), [
    'san-pedro-first',
    'san-jose-second',
  ]);
});

test('los metadatos regionales de sugerencia no cruzan al City canónico v4', () => {
  const canonical = canonicalCityFromSearchResult({
    id: 'paris',
    name: 'París',
    displayName: 'París, Francia',
    region: 'Île-de-France',
    regionCode: 'IDF',
    country: 'Francia',
    countryCode: 'fr',
    lat: 48.8566,
    lon: 2.3522,
    rank: { confidence: 1 },
    aliases: ['Paris'],
  });

  assert.deepEqual(Object.keys(canonical).sort(), [
    'country',
    'countryCode',
    'displayName',
    'id',
    'lat',
    'lon',
    'name',
  ]);
  assert.equal(canonical.countryCode, 'FR');
  assert.equal('region' in canonical, false);
  assert.equal('regionCode' in canonical, false);
});
