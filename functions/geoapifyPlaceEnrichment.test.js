import test from 'node:test';
import assert from 'node:assert/strict';
import {
  extractPlaceEnrichment,
  nameSimilarity,
} from './geoapifyPlaceEnrichment.js';

test('accepts nearby translated place names and returns only website and hours', () => {
  const payload = {
    features: [{
      properties: {
        feature_type: 'details',
        name: 'Colosseo',
        lat: 41.89021,
        lon: 12.49223,
        website: 'https://colosseo.it/',
        opening_hours: 'Mo-Su 08:30-19:15',
      },
    }],
  };

  const result = extractPlaceEnrichment(payload, {
    name: 'Colosseum',
    lat: 41.89025,
    lon: 12.49220,
  });

  assert.equal(result.matched, true);
  assert.equal(result.website, 'https://colosseo.it/');
  assert.equal(result.openingHours, 'Mo-Su 08:30-19:15');
});

test('rejects a different nearby feature instead of attaching wrong details', () => {
  const payload = {
    features: [{
      properties: {
        feature_type: 'details',
        name: 'Colosseo Metro Station',
        lat: 41.89040,
        lon: 12.49190,
        website: 'https://example.com/',
        opening_hours: '24/7',
      },
    }],
  };

  const result = extractPlaceEnrichment(payload, {
    name: 'Colosseum',
    lat: 41.89025,
    lon: 12.49220,
  });

  assert.equal(result.matched, false);
  assert.equal(result.website, '');
  assert.equal(result.openingHours, '');
});

test('name matching tolerates common localized variants', () => {
  assert.ok(nameSimilarity('Anne Frank House', 'Anne Frank Huis') > 0.56);
});
