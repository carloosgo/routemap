import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeGeoapifyCityResults } from './geoapifyCityUtils.js';

function city(overrides = {}) {
  return {
    place_id: 'place-1',
    city: 'Москва',
    name: 'Москва',
    country: 'Россия',
    country_code: 'ru',
    state: 'Москва',
    county: 'Москва',
    lat: 55.7558,
    lon: 37.6173,
    other_names: {
      'name:es': 'Moscú',
      'name:en': 'Moscow',
    },
    ...overrides,
  };
}

test('deduplica nodo y boundary de la misma ciudad aunque cambien place_id y coordenadas', () => {
  const results = normalizeGeoapifyCityResults([
    city({ place_id: 'node-moscow' }),
    city({ place_id: 'relation-moscow', lat: 55.7512, lon: 37.6184 }),
  ], { language: 'es', limit: 5 });

  assert.equal(results.length, 1);
  assert.equal(results[0].name, 'Moscú');
  assert.equal(results[0].countryCode, 'RU');
});

test('usa el idioma de la app y evita el alfabeto nativo cuando hay nombre latino disponible', () => {
  const spanish = normalizeGeoapifyCityResults([city()], { language: 'es' });
  const english = normalizeGeoapifyCityResults([city()], { language: 'en' });

  assert.equal(spanish[0].name, 'Moscú');
  assert.equal(english[0].name, 'Moscow');
});

test('cae a nombre ingles o latino si el proveedor devuelve la ciudad en otro alfabeto', () => {
  const results = normalizeGeoapifyCityResults([
    city({
      place_id: 'tokyo',
      city: '東京',
      name: '東京',
      country: '日本',
      country_code: 'jp',
      state: '東京都',
      county: '',
      lat: 35.6764,
      lon: 139.65,
      other_names: { 'name:en': 'Tokyo' },
    }),
  ], { language: 'es' });

  assert.equal(results[0].name, 'Tokyo');
  assert.equal(results[0].countryCode, 'JP');
  assert.doesNotMatch(results[0].name, /[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}]/u);
});

test('conserva ciudades homonimas lejanas y no expone metadatos internos', () => {
  const results = normalizeGeoapifyCityResults([
    city({
      place_id: 'springfield-il',
      city: 'Springfield',
      name: 'Springfield',
      country: 'United States',
      country_code: 'us',
      state: 'Illinois',
      county: 'Sangamon County',
      lat: 39.7817,
      lon: -89.6501,
      other_names: { 'name:en': 'Springfield' },
    }),
    city({
      place_id: 'springfield-ma',
      city: 'Springfield',
      name: 'Springfield',
      country: 'United States',
      country_code: 'us',
      state: 'Massachusetts',
      county: 'Hampden County',
      lat: 42.1015,
      lon: -72.5898,
      other_names: { 'name:en': 'Springfield' },
    }),
  ], { language: 'en', limit: 5 });

  assert.equal(results.length, 2);
  assert.deepEqual(Object.keys(results[0]).sort(), [
    'country',
    'countryCode',
    'displayName',
    'id',
    'lat',
    'lon',
    'name',
  ]);
});
