import test from 'node:test';
import assert from 'node:assert/strict';
import { colorForIndex, config, countryColorForIndex } from '../src/config.js';

test('config usa valores seguros fuera de Vite', () => {
  assert.equal(config.storageKey, 'atlas:trips:v1');
  assert.equal(config.citySearchMinChars, 3);
  assert.equal(config.citySearchLimit, 5);
  assert.equal(config.defaultLocale, 'es');
  assert.equal(config.geoapify.functionRegion, 'us-central1');
  assert.equal(config.firebase.projectId, '');
  assert.deepEqual(config.storageV4Rollout, {
    enabled: false,
    killSwitch: true,
    mode: 'off',
    cohortPercent: 0,
    salt: 'atlas-storage-v4',
    readRulesReady: false,
    writeRulesReady: false,
    syncReady: false,
    aggregateReady: false,
    lifecycleReady: false,
    purgeReady: false,
    remoteConfigEnabled: false,
    telemetryEnabled: false,
  });
});

test('colorForIndex cicla la paleta y tolera índices inválidos', () => {
  assert.equal(colorForIndex(0), config.segmentColors[0]);
  assert.equal(colorForIndex(config.segmentColors.length), config.segmentColors[0]);
  assert.equal(colorForIndex(-1), config.segmentColors.at(-1));
  assert.equal(colorForIndex('invalid'), config.segmentColors[0]);
});

test('las paletas del mapa mantienen variedad antes de ciclar colores', () => {
  assert.ok(config.segmentColors.length >= 24);
  assert.ok(config.countryColors.length >= 24);
  assert.equal(new Set(config.segmentColors.slice(0, 12)).size, 12);
  assert.equal(new Set(config.countryColors.slice(0, 12)).size, 12);
  assert.equal(countryColorForIndex(0), config.countryColors[0]);
  assert.equal(countryColorForIndex(config.countryColors.length), config.countryColors[0]);
});
