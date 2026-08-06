import test from 'node:test';
import assert from 'node:assert/strict';
import { colorForIndex, config } from '../src/config.js';

test('config usa valores seguros fuera de Vite', () => {
  assert.equal(config.storageDriver, 'local');
  assert.equal(config.citySearchMinChars, 3);
  assert.equal(config.citySearchLimit, 5);
  assert.equal(config.defaultLocale, 'es');
  assert.equal(config.apiBaseUrl, '');
  assert.equal(config.geoapify.mapApiKey, '');
  assert.equal(config.firebase.projectId, '');
});

test('colorForIndex cicla la paleta y tolera índices inválidos', () => {
  assert.equal(colorForIndex(0), config.segmentColors[0]);
  assert.equal(colorForIndex(config.segmentColors.length), config.segmentColors[0]);
  assert.equal(colorForIndex(-1), config.segmentColors.at(-1));
  assert.equal(colorForIndex('invalid'), config.segmentColors[0]);
});
