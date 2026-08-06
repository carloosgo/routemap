import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { normalizeTrip, TRIP_LIMITS } from '../src/modules/trips/tripModel.js';

const read = (path) => readFile(path, 'utf8');

test('las Functions generales limitan entradas y reverse normaliza la respuesta', async () => {
  const places = await read('functions/geoapifyPlaceFunctions.js');
  const batch = await read('functions/geoapifyBatchFunctions.js');
  const routes = await read('functions/geoapifyRouteFunctions.js');

  assert.match(places, /MAX_QUERY_CHARS = 160/);
  assert.match(places, /raw\.length > MAX_QUERY_CHARS/);
  assert.match(batch, /MAX_BATCH_QUERY_CHARS = 160/);
  assert.match(batch, /query\.length > MAX_BATCH_QUERY_CHARS/);
  assert.match(routes, /return mapPlace\(payload\.results\?\.\[0\]\) \|\| null/);
  assert.match(routes, /reverse:v2:/);
});

test('la migración conserva lugares actuales y legados sin duplicarlos', () => {
  const shared = {
    id: 'place-shared',
    name: 'Museo',
    lat: 19.4326,
    lon: -99.1332,
  };
  const trip = normalizeTrip({
    id: 'trip-legacy-places',
    places: [shared],
    segments: [
      {
        id: 'segment-1',
        places: [
          { ...shared, id: 'legacy-duplicate' },
          { id: 'legacy-only', name: 'Parque', lat: 19.43, lon: -99.14 },
        ],
      },
    ],
  });

  assert.deepEqual(trip.places.map((place) => place.name), ['Museo', 'Parque']);
  assert.equal(Object.hasOwn(trip.segments[0], 'places'), false);
});

test('la migración limita el trabajo y el resultado de lugares manipulados', () => {
  const currentPlaces = Array.from({ length: TRIP_LIMITS.places + 20 }, (_, index) => ({
    id: `current-${index}`,
    name: `Lugar actual ${index}`,
    lat: 19.4326,
    lon: -99.1332,
  }));
  const legacyPlaces = Array.from(
    { length: TRIP_LIMITS.placesPerSegment + 20 },
    (_, index) => ({
      id: `legacy-${index}`,
      name: `Lugar legado ${index}`,
      lat: 20.4326,
      lon: -100.1332,
    })
  );

  const trip = normalizeTrip({
    id: 'trip-bounded-legacy-places',
    places: currentPlaces,
    segments: [{ id: 'segment-1', places: legacyPlaces }],
  });

  assert.equal(trip.places.length, TRIP_LIMITS.places);
  assert.equal(trip.places.at(-1).name, `Lugar actual ${TRIP_LIMITS.places - 1}`);
});

test('la documentación y ejemplos reflejan secretos separados y ausencia de Nominatim', async () => {
  const environment = await read('.env.example');
  const firebase = await read('docs/FIREBASE_FOUNDATION.md');

  assert.doesNotMatch(environment, /VITE_GEOCODER=nominatim/);
  assert.match(environment, /GEOAPIFY_CITY_API_KEY/);
  assert.match(environment, /GEOAPIFY_API_KEY/);
  assert.match(firebase, /Plan: Blaze/);
  assert.match(firebase, /GEOAPIFY_CITY_API_KEY/);
});

test('los archivos de entorno de Functions quedan fuera de Git', async () => {
  const gitignore = await read('.gitignore');
  assert.match(gitignore, /^functions\/\.env\.\*$/m);
  assert.match(gitignore, /^!functions\/\.env\.example$/m);
});
