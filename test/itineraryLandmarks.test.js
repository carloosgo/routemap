import test from 'node:test';
import assert from 'node:assert/strict';

import {
  itineraryLandmarksFromFeatures,
  landmarkForCityName,
  normalizeLandmarkCityName,
} from '../src/modules/map/itineraryLandmarkCatalog.js';
import {
  landmarkCssSize,
  landmarkOpacityForZoom,
} from '../src/modules/map/webglLandmarkOverlay.js';

test('normaliza nombres internacionales de ciudades para landmarks', () => {
  assert.equal(normalizeLandmarkCityName('München'), 'munchen');
  assert.equal(normalizeLandmarkCityName('Fráncfort del Meno'), 'francfort del meno');
  assert.equal(landmarkForCityName('París')?.id, 'paris-eiffel');
  assert.equal(landmarkForCityName('Fráncfort del Meno')?.id, 'frankfurt-skyline');
  assert.equal(landmarkForCityName('München')?.id, 'munich-frauenkirche');
  assert.equal(landmarkForCityName('Rothenburg ob der Tauber'), null);
});

test('construye landmarks solo para ciudades curadas y con coordenadas válidas', () => {
  const landmarks = itineraryLandmarksFromFeatures([
    {
      properties: { name: 'París' },
      geometry: { coordinates: [2.3522, 48.8566] },
    },
    {
      properties: { name: 'Berlín' },
      geometry: { coordinates: [13.405, 52.52] },
    },
    {
      properties: { name: 'Bamberg' },
      geometry: { coordinates: [10.886, 49.891] },
    },
  ]);

  assert.deepEqual(landmarks.map((landmark) => landmark.id), [
    'paris-eiffel',
    'berlin-brandenburg',
  ]);
  assert.equal(landmarks[0].lat, 48.8566);
  assert.equal(landmarks[0].lng, 2.3522);
});

test('mantiene tamaño de pantalla y hace handoff gradual a landmarks nativos', () => {
  assert.equal(landmarkCssSize(1200, 6, 1), 46);
  assert.equal(landmarkCssSize(390, 6, 1), 36);
  assert.equal(landmarkOpacityForZoom(6), 1);
  assert.equal(landmarkOpacityForZoom(12.25), 1);
  assert.equal(landmarkOpacityForZoom(13.5), 0);
  assert.ok(landmarkOpacityForZoom(13) > 0 && landmarkOpacityForZoom(13) < 1);
});
