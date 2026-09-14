// test-contract: behavior
import test from 'node:test';
import assert from 'node:assert/strict';
import { buildItineraryStaticMapUrl } from './geoapifyStaticMapFunction.js';

test('construye un mapa estatico de alta resolucion con viewport controlado', () => {
  const url = new URL(buildItineraryStaticMapUrl({
    center: { lat: 48.2, lon: 6.5 },
    zoom: 5.25,
    language: 'es',
  }, 'test-key'));
  assert.equal(url.origin, 'https://maps.geoapify.com');
  assert.equal(url.pathname, '/v1/staticmap');
  assert.equal(url.searchParams.get('style'), 'osm-bright');
  assert.equal(url.searchParams.get('width'), '720');
  assert.equal(url.searchParams.get('height'), '620');
  assert.equal(url.searchParams.get('scaleFactor'), '2');
  assert.equal(url.searchParams.get('format'), 'jpeg');
  assert.equal(url.searchParams.get('center'), 'lonlat:6.500000,48.200000');
  assert.equal(url.searchParams.get('zoom'), '5.2500');
  assert.equal(url.searchParams.get('apiKey'), 'test-key');
});