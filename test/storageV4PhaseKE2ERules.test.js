import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import {
  composePhaseKE2ERules,
  PHASE_K_E2E_TRIP_PREFIX,
} from '../scripts/firestorePhaseKE2ERules.mjs';

const v3Path = new URL('../firestore.rules', import.meta.url);
const v4Path = new URL('../firestore-v4.rules', import.meta.url);

test('Phase K E2E rules preservan v3 y agregan v4 solo con prefijo sintetico', async () => {
  const [v3, v4] = await Promise.all([
    readFile(v3Path, 'utf8'),
    readFile(v4Path, 'utf8'),
  ]);
  const composed = composePhaseKE2ERules(v3, v4);

  assert.equal(PHASE_K_E2E_TRIP_PREFIX, 'phase-k-e2e-');
  assert.ok(composed.includes("data.storageVersion == 3"));
  assert.ok(composed.includes("data.schemaVersion == 4"));
  assert.ok(composed.includes('function phaseKOwnsProbeTrip(userId, tripId)'));
  assert.ok(composed.includes("tripId.matches('^phase-k-e2e-[a-z0-9_-]{8,80}$')"));
  assert.ok(composed.includes("allow delete: if ownsUserPath(userId)\n          && !tripId.matches('^phase-k-e2e-[a-z0-9_-]{8,80}$');"));
  assert.ok(composed.includes('allow delete: if false;'));
  assert.ok(!composed.includes('allow delete: if phaseKOwnsProbeTrip(userId, tripId);'));
  assert.ok(composed.includes('phaseKValidClientTripCreate'));
  assert.ok(composed.includes('phaseKValidEntityUpdate'));
});

test('bloque v4 temporal limita writes al probe y conserva deletes server-authoritative', async () => {
  const [v3, v4] = await Promise.all([
    readFile(v3Path, 'utf8'),
    readFile(v4Path, 'utf8'),
  ]);
  const composed = composePhaseKE2ERules(v3, v4);
  const marker = '    // Phase K E2E temporal: v4 write solo para trips sinteticos.';
  const start = composed.indexOf(marker);
  assert.ok(start >= 0);
  const scoped = composed.slice(start, composed.indexOf('    match /{document=**} {', start));

  assert.ok(scoped.includes('phaseKOwnsProbeTrip(userId, tripId)'));
  assert.ok(!scoped.includes('phaseKOwnsUserPath(userId)'));
  assert.ok(scoped.includes('allow delete: if false;'));
  assert.ok(!scoped.includes('allow delete: if phaseKOwnsProbeTrip(userId, tripId);'));
});

test('compositor falla cerrado si cambian los puntos estructurales de las rules', () => {
  assert.throws(
    () => composePhaseKE2ERules('rules_version = \'2\';', 'rules_version = \'2\';'),
    /marcador/
  );
});
