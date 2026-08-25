import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

import { normalizeGeoapifyCityResults } from '../functions/geoapifyCityUtils.js';
import { sanitizeCitySearchResults } from '../src/modules/geocoding/citySearchClient.js';

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

test('la normalización de ciudades no reintroduce heurísticas GIS por distancia o condado', async () => {
  const source = await readFile('functions/geoapifyCityUtils.js', 'utf8');

  assert.doesNotMatch(source, /distanceKm|toRadians|countyKey|sameCounty|separation/);
});
