import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { composePilotWriteRules } from '../scripts/firestorePilotWriteRules.mjs';

async function sources() {
  const [v3, v4] = await Promise.all([
    readFile(new URL('../firestore.rules', import.meta.url), 'utf8'),
    readFile(new URL('../firestore-v4.rules', import.meta.url), 'utf8'),
  ]);
  return { v3, v4 };
}

function count(source, pattern) {
  return source.match(pattern)?.length || 0;
}

test('pilot write conserva legacy y protege hard delete del root v4', async () => {
  const { v3, v4 } = await sources();
  const composed = composePilotWriteRules(v3, v4);

  assert.match(
    composed,
    /allow delete: if ownsUserPath\(userId\)\s+&& \(resource\.data\.storageVersion == 2 \|\| resource\.data\.storageVersion == 3\);/
  );
  assert.equal(
    count(composed, /allow delete: if ownsUserPath\(userId\);/g),
    count(v3, /allow delete: if ownsUserPath\(userId\);/g) - 1
  );
  assert.match(composed, /pilotValidClientTripCreate\(request\.resource\.data, tripId\)/);
  assert.match(composed, /pilotValidClientTripUpdate\(\)/);
  assert.match(composed, /allow delete: if false;/);
});

test('pilot write prefija helpers v4 y evita colisiones con validadores legacy', async () => {
  const { v3, v4 } = await sources();
  const composed = composePilotWriteRules(v3, v4);

  assert.equal(count(composed, /function signedIn\(/g), 1);
  assert.equal(count(composed, /function pilotSignedIn\(/g), 1);
  assert.equal(count(composed, /function validSegment\(/g), 1);
  assert.equal(count(composed, /function pilotValidSegment\(/g), 1);
  assert.equal(count(composed, /function validPlace\(/g), 1);
  assert.equal(count(composed, /function pilotValidPlace\(/g), 1);
  assert.equal(count(composed, /match \/users\/\{userId\} \{/g), 2);
  assert.equal(count(composed, /match \/trips\/\{tripId\} \{/g), 2);
});

test('pilot write conserva las revisiones v3 y añade las cinco colecciones v4 top-level', async () => {
  const { v3, v4 } = await sources();
  const composed = composePilotWriteRules(v3, v4);

  assert.match(composed, /match \/revisions\/\{revisionId\}/);
  assert.match(composed, /match \/segments\/\{segmentId\}/);
  assert.match(composed, /match \/places\/\{placeId\}/);
  assert.match(composed, /match \/connections\/\{connectionId\}/);
  assert.match(composed, /match \/notes\/\{noteId\}/);
  assert.match(composed, /match \/checklist\/\{itemId\}/);
  assert.doesNotMatch(composed, /phase-k-e2e-/);
});

test('compositor pilot falla cerrado si cambia la estructura esperada', async () => {
  const { v3, v4 } = await sources();
  assert.throws(
    () => composePilotWriteRules(v3.replace('        match /revisions/{revisionId} {', ''), v4),
    /revision v3/
  );
  assert.throws(
    () => composePilotWriteRules(v3, v4.replace('    match /{document=**} {', '')),
    /catch-all v4/
  );
});
