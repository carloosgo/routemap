import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeGeoapifyCityResults } from './geoapifyCityUtils.js';

function city(overrides = {}) {
  return {
    place_id: 'place-1',
    result_type: 'city',
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

test('normaliza Shanghai desde un resultado chino usando un alias latino', () => {
  const results = normalizeGeoapifyCityResults([
    city({
      place_id: 'shanghai',
      city: '上海市',
      name: '上海',
      country: '中国',
      country_code: 'cn',
      state: '上海市',
      county: '',
      lat: 31.2304,
      lon: 121.4737,
      other_names: { 'name:en': 'Shanghai' },
    }),
  ], { language: 'es' });

  assert.equal(results.length, 1);
  assert.equal(results[0].name, 'Shanghai');
  assert.equal(results[0].countryCode, 'CN');
  assert.doesNotMatch(results[0].name, /\p{Script=Han}/u);
});

test('normaliza nombres arabes desde un alias latino disponible', () => {
  const results = normalizeGeoapifyCityResults([
    city({
      place_id: 'cairo',
      city: 'القاهرة',
      name: 'القاهرة',
      country: 'مصر',
      country_code: 'eg',
      state: 'القاهرة',
      county: '',
      lat: 30.0444,
      lon: 31.2357,
      other_names: { 'name:en': 'Cairo' },
    }),
  ], { language: 'es' });

  assert.equal(results.length, 1);
  assert.equal(results[0].name, 'Cairo');
  assert.doesNotMatch(results[0].name, /\p{Script=Arabic}/u);
});

test('descarta candidatos que solo tienen nombre en alfabeto no latino', () => {
  const results = normalizeGeoapifyCityResults([
    city({
      place_id: 'native-only',
      city: '卓资县',
      name: '卓资县',
      country: '中国',
      country_code: 'cn',
      state: '内蒙古自治区',
      county: '',
      lat: 40.8958,
      lon: 112.5777,
      other_names: {},
    }),
  ], { language: 'es' });

  assert.deepEqual(results, []);
});

test('respeta el limite maximo de cinco resultados normalizados', () => {
  const items = Array.from({ length: 7 }, (_, index) => city({
    place_id: `city-${index}`,
    city: `City ${index}`,
    name: `City ${index}`,
    country: 'United States',
    country_code: 'us',
    state: `State ${index}`,
    county: `County ${index}`,
    lat: 30 + index,
    lon: -100 + index,
    other_names: { 'name:en': `City ${index}` },
  }));

  const results = normalizeGeoapifyCityResults(items, { language: 'en', limit: 99 });

  assert.equal(results.length, 5);
});

test('conserva ciudades homonimas lejanas, las desambigua y no expone metadatos internos', () => {
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
  ], { language: 'en', limit: 5, query: 'springfield' });

  assert.equal(results.length, 2);
  assert.equal(results[0].displayName, 'Springfield, Illinois, United States');
  assert.equal(results[1].displayName, 'Springfield, Massachusetts, United States');
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

test('tokio conserva ciudades con nombre relevante y elimina candidatos ajenos', () => {
  const results = normalizeGeoapifyCityResults([
    city({
      place_id: 'tokyo-jp',
      city: '東京',
      name: '東京',
      country: '日本',
      country_code: 'jp',
      state: '東京都',
      lat: 35.6764,
      lon: 139.65,
      other_names: { 'name:es': 'Tokio', 'name:en': 'Tokyo' },
    }),
    city({
      place_id: 'riberalta', city: 'Riberalta', name: 'Riberalta',
      country: 'Bolivia', country_code: 'bo', state: 'Beni', lat: -10.99, lon: -66.08,
      other_names: { 'name:es': 'Riberalta' },
    }),
    city({
      place_id: 'pandan', city: 'Pandan', name: 'Pandan',
      country: 'Philippines', country_code: 'ph', state: 'Antique', lat: 11.72, lon: 122.09,
      other_names: { 'name:en': 'Pandan' },
    }),
    city({
      place_id: 'tokio-pg', city: 'Tokio', name: 'Tokio',
      country: 'Papua New Guinea', country_code: 'pg', state: 'East New Britain', lat: -4.3, lon: 152.1,
      other_names: { 'name:en': 'Tokio' },
    }),
    city({
      place_id: 'amco', city: 'AMCO', name: 'AMCO',
      country: 'Colombia', country_code: 'co', state: 'Risaralda', lat: 4.8, lon: -75.7,
      other_names: { 'name:es': 'AMCO' },
    }),
  ], { language: 'es', limit: 5, query: 'tokio' });

  assert.deepEqual(results.map((result) => result.name), ['Tokio', 'Tokio']);
  assert.deepEqual(results.map((result) => result.countryCode), ['JP', 'PG']);
});

test('shangai conserva coincidencias textuales plausibles y elimina ciudades sin relación', () => {
  const results = normalizeGeoapifyCityResults([
    city({
      place_id: 'shanghai', city: '上海市', name: '上海', country: '中国', country_code: 'cn',
      state: '上海市', lat: 31.2304, lon: 121.4737, other_names: { 'name:en': 'Shanghai' },
    }),
    city({
      place_id: 'shangaime', city: 'Shangaime', name: 'Shangaime', country: 'Ecuador',
      country_code: 'ec', state: 'Morona Santiago', lat: -2.3, lon: -78.1,
      other_names: { 'name:es': 'Shangaime' },
    }),
    city({
      place_id: 'mogi', city: 'Mogi das Cruzes', name: 'Mogi das Cruzes', country: 'Brazil',
      country_code: 'br', state: 'São Paulo', lat: -23.52, lon: -46.19,
      other_names: { 'name:en': 'Mogi das Cruzes' },
    }),
    city({
      place_id: 'pendembu', city: 'Pendembu', name: 'Pendembu', country: 'Sierra Leone',
      country_code: 'sl', state: 'Eastern Province', lat: 8.1, lon: -10.7,
      other_names: { 'name:en': 'Pendembu' },
    }),
    city({
      place_id: 'chiacalte', city: 'Chiacalté', name: 'Chiacalté', country: 'Guatemala',
      country_code: 'gt', state: 'Alta Verapaz', lat: 15.5, lon: -90.3,
      other_names: { 'name:es': 'Chiacalté' },
    }),
  ], { language: 'es', limit: 5, query: 'shangai' });

  assert.deepEqual(results.map((result) => result.name), ['Shanghai', 'Shangaime']);
  assert.equal(results.some((result) => ['Mogi das Cruzes', 'Pendembu', 'Chiacalté'].includes(result.name)), false);
});

test('etiopia no convierte una coincidencia débil del proveedor en ciudad válida', () => {
  const results = normalizeGeoapifyCityResults([
    city({
      place_id: 'guira', city: 'Güira de Melena', name: 'Güira de Melena', country: 'Cuba',
      country_code: 'cu', state: 'Artemisa', lat: 22.79, lon: -82.51,
      other_names: { 'name:es': 'Güira de Melena' },
    }),
  ], { language: 'es', query: 'etiopia' });

  assert.deepEqual(results, []);
});

test('jordania conserva la ciudad homónima y rechaza amenities y candidatos irrelevantes', () => {
  const results = normalizeGeoapifyCityResults([
    city({
      place_id: 'jordania-br', city: 'Jordânia', name: 'Jordânia', country: 'Brazil',
      country_code: 'br', state: 'Minas Gerais', lat: -15.9, lon: -40.18,
      other_names: { 'name:es': 'Jordânia' },
    }),
    city({
      place_id: 'santa-maria', city: 'Santa Maria', name: 'Santa Maria', country: 'Brazil',
      country_code: 'br', state: 'Rio Grande do Sul', lat: -29.69, lon: -53.8,
      other_names: { 'name:en': 'Santa Maria' },
    }),
    city({
      place_id: 'police', result_type: 'amenity', city: 'Bethlehem', name: 'Jordanian Police Station',
      country: 'Palestinian Territories', country_code: 'ps', state: 'West Bank', lat: 31.7, lon: 35.2,
      other_names: { 'name:en': 'Jordanian Police Station' },
    }),
    city({
      place_id: 'bethlehem-za', city: 'Bethlehem', name: 'Bethlehem', country: 'South Africa',
      country_code: 'za', state: 'Free State', lat: -28.23, lon: 28.3,
      other_names: { 'name:en': 'Bethlehem' },
    }),
    city({
      place_id: 'apia-co', city: 'Apía', name: 'Apía', country: 'Colombia',
      country_code: 'co', state: 'Risaralda', lat: 5.1, lon: -75.94,
      other_names: { 'name:es': 'Apía' },
    }),
  ], { language: 'es', limit: 5, query: 'jordania' });

  assert.deepEqual(results.map((result) => result.name), ['Jordânia']);
  assert.equal(results.some((result) => result.name === 'Jordanian Police Station'), false);
});

test('paris colapsa representaciones administrativas de la misma ciudad y conserva homónimos reales', () => {
  const results = normalizeGeoapifyCityResults([
    city({
      place_id: 'paris-node', city: 'Paris', name: 'Paris', country: 'France', country_code: 'fr',
      state: 'Île-de-France', lat: 48.8566, lon: 2.3522,
      other_names: { 'name:es': 'París', 'name:en': 'Paris' },
    }),
    city({
      place_id: 'paris-boundary', city: 'Paris', name: 'Paris', country: 'France', country_code: 'fr',
      state: 'Paris', lat: 48.8601, lon: 2.3408,
      other_names: { 'name:es': 'París', 'name:en': 'Paris' },
    }),
    city({
      place_id: 'paris-centroid', city: 'Paris', name: 'Paris', country: 'France', country_code: 'fr',
      state: 'Île-de-France', lat: 48.853, lon: 2.3499,
      other_names: { 'name:es': 'París', 'name:en': 'Paris' },
    }),
    city({
      place_id: 'paris-township', city: 'Paris Township', name: 'Paris Township',
      country: 'United States', country_code: 'us', state: 'Michigan', lat: 43.77, lon: -85.5,
      other_names: { 'name:en': 'Paris Township' },
    }),
  ], { language: 'es', limit: 5, query: 'paris' });

  assert.equal(results.filter((result) => result.countryCode === 'FR').length, 1);
  assert.equal(results.some((result) => result.name === 'Paris Township'), true);
});
