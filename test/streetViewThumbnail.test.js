// test-contract: architecture
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import {
  buildStreetViewThumbnailUrl,
  streetViewLocation,
} from '../src/modules/places/googleStreetViewThumbnail.js';
import { placeForPersistence } from '../src/modules/trips/tripEntities.js';

const root = new URL('../', import.meta.url);
const read = (path) => readFile(new URL(path, root), 'utf8');

test('Street View prioriza la dirección real y luego coordenadas válidas', () => {
  assert.equal(
    streetViewLocation({
      address: 'Schaumainkai 63, Frankfurt am Main, Germany',
      name: 'Städel Museum',
      lat: 50.1033,
      lon: 8.6739,
    }),
    'Schaumainkai 63, Frankfurt am Main, Germany'
  );
  assert.equal(
    streetViewLocation({ lat: 50.1033, lon: 8.6739 }),
    '50.1033,8.6739'
  );
});

test('un lugar Google persistido conserva una ubicación textual útil para Street View', () => {
  const persisted = placeForPersistence({
    id: 'ChIJD3uTd9hx5kcR1IQvGfr8dbk',
    provider: 'google',
    googlePlaceId: 'ChIJD3uTd9hx5kcR1IQvGfr8dbk',
    userLabel: 'Museo del Louvre, Paris, Francia',
    name: 'Musée du Louvre',
    address: 'Rue de Rivoli, 75001 Paris, France',
    city: 'Paris',
    country: 'Francia',
    lat: 48.8606111,
    lon: 2.337644,
  });

  assert.equal(persisted.name, '');
  assert.equal(persisted.address, '');
  assert.equal(persisted.lat, null);
  assert.equal(persisted.lon, null);
  assert.equal(
    streetViewLocation(persisted),
    'Museo del Louvre, Paris, Francia'
  );

  const url = new URL(buildStreetViewThumbnailUrl(persisted, 'public-browser-key'));
  assert.equal(
    url.searchParams.get('location'),
    'Museo del Louvre, Paris, Francia'
  );
});

test('la miniatura Street View usa un request pequeño, outdoor y sin heading fijo', () => {
  const value = buildStreetViewThumbnailUrl({
    address: 'Römerberg 26, Frankfurt am Main, Germany',
  }, 'public-browser-key');
  const url = new URL(value);

  assert.equal(url.origin, 'https://maps.googleapis.com');
  assert.equal(url.pathname, '/maps/api/streetview');
  assert.equal(url.searchParams.get('size'), '96x64');
  assert.equal(url.searchParams.get('location'), 'Römerberg 26, Frankfurt am Main, Germany');
  assert.equal(url.searchParams.get('fov'), '90');
  assert.equal(url.searchParams.get('pitch'), '0');
  assert.equal(url.searchParams.get('radius'), '80');
  assert.equal(url.searchParams.get('source'), 'outdoor');
  assert.equal(url.searchParams.get('return_error_code'), 'true');
  assert.equal(url.searchParams.get('key'), 'public-browser-key');
  assert.equal(url.searchParams.has('heading'), false);
});

test('sin clave web o ubicación no se genera ninguna solicitud facturable', () => {
  assert.equal(buildStreetViewThumbnailUrl({ address: 'Frankfurt' }, ''), '');
  assert.equal(buildStreetViewThumbnailUrl({}, 'public-browser-key'), '');
});

test('Mis Rutas carga Street View sólo cerca del viewport y antes del nombre', async () => {
  const thumbnail = await read('src/modules/places/StreetViewThumbnail.jsx');
  const panel = await read('src/modules/places/TripPlacesDayFirstPanel.jsx');

  assert.match(thumbnail, /const Observer = globalThis\.IntersectionObserver;/);
  assert.match(thumbnail, /new Observer/);
  assert.match(thumbnail, /rootMargin: '160px 0px'/);
  assert.match(thumbnail, /\{shouldLoad && \(/);
  assert.match(thumbnail, /loading="lazy"/);
  assert.match(thumbnail, /return null;/);
  assert.match(thumbnail, /onError=\{\(\) => setFailed\(true\)\}/);
  assert.match(thumbnail, /translate="no">\s*Google Maps/);
  assert.doesNotMatch(thumbnail, /localStorage|sessionStorage|indexedDB|fetch\(/);

  const thumbnailIndex = panel.indexOf('<StreetViewThumbnail place={place} />');
  const titleIndex = panel.indexOf('<span className="trip-place__info trip-day-first-place__info">');
  assert.ok(thumbnailIndex > 0 && thumbnailIndex < titleIndex, 'la imagen debe aparecer antes del nombre');
  assert.match(panel, /trip-day-first-place__streetview img\{[^}]*width:96px;height:64px;[^}]*border:/);
  assert.doesNotMatch(panel, /trip-day-first-place__streetview img\{[^}]*object-fit/);
});
