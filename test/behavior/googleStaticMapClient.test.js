// test-contract: behavior
import test from 'node:test';
import assert from 'node:assert/strict';
import { buildGoogleStaticMapUrl } from '../../src/modules/export/googleStaticMapClient.js';

test('Google Static Maps conserva cámara, map type, map id y usa scale 2', () => {
  const { url, size, zoom } = buildGoogleStaticMapUrl({
    center: { lat: 50.1109, lon: 8.6821 },
    zoom: 5.2,
    mapType: 'roadmap',
    width: 1600,
    height: 800,
  }, {
    language: 'es',
    apiKey: 'public-test-key',
    mapId: 'static-map-id',
  });
  const parsed = new URL(url);

  assert.equal(parsed.origin, 'https://maps.googleapis.com');
  assert.equal(parsed.pathname, '/maps/api/staticmap');
  assert.equal(parsed.searchParams.get('center'), '50.1109000,8.6821000');
  assert.equal(parsed.searchParams.get('zoom'), '5');
  assert.equal(parsed.searchParams.get('maptype'), 'roadmap');
  assert.equal(parsed.searchParams.get('map_id'), 'static-map-id');
  assert.equal(parsed.searchParams.get('scale'), '2');
  assert.equal(parsed.searchParams.get('size'), '640x320');
  assert.equal(parsed.searchParams.get('key'), 'public-test-key');
  assert.deepEqual(size, { width: 640, height: 320 });
  assert.equal(zoom, 5);
});

test('Google Static Maps exige un Map ID de plataforma Static para preservar estilo', () => {
  assert.throws(
    () => buildGoogleStaticMapUrl({
      center: { lat: 48.8, lon: 2.3 },
      zoom: 6,
      mapType: 'roadmap',
      width: 1200,
      height: 700,
    }, { apiKey: 'key', mapId: '' }),
    /VITE_GOOGLE_MAPS_STATIC_MAP_ID/
  );
});
