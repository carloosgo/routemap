import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import {
  GATE_G_V4_READ_MATCHES,
  composeGateGReadRules,
} from '../scripts/firestoreGateGReadRules.mjs';

const ROOT_DELETE = '        allow delete: if ownsUserPath(userId);';
const GUARDED_ROOT_DELETE = `        allow delete: if ownsUserPath(userId)
          && (resource.data.storageVersion == 2 || resource.data.storageVersion == 3);`;

async function legacyRules() {
  return readFile(new URL('../firestore.rules', import.meta.url), 'utf8');
}

test('Gate G READ bloquea hard delete legacy sobre roots v4 sin alterar deletes de revisiones', async () => {
  const legacy = await legacyRules();
  const composed = composeGateGReadRules(legacy);

  const tripsStart = composed.indexOf('      match /trips/{tripId} {');
  const revisionStart = composed.indexOf('        match /revisions/{revisionId} {');
  const rootBlock = composed.slice(tripsStart, revisionStart);
  const revisionBlock = composed.slice(revisionStart);

  assert.match(rootBlock, /resource\.data\.storageVersion == 2/);
  assert.match(rootBlock, /resource\.data\.storageVersion == 3/);
  assert.equal(rootBlock.includes(ROOT_DELETE), false);
  assert.equal(rootBlock.includes(GUARDED_ROOT_DELETE), true);
  assert.equal(revisionBlock.includes(ROOT_DELETE), true);
});

test('Gate G READ conserva lectura v4 pero mantiene todas sus escrituras directas cerradas', async () => {
  const composed = composeGateGReadRules(await legacyRules());

  assert.ok(composed.includes(GATE_G_V4_READ_MATCHES));
  for (const collection of ['segments', 'places', 'connections', 'notes', 'checklist']) {
    assert.match(composed, new RegExp(`match /${collection}/\\{documentId\\} \\{`));
  }
  assert.equal(
    (GATE_G_V4_READ_MATCHES.match(/allow create, update, delete: if false;/g) || []).length,
    5
  );
});

test('Gate G READ falla cerrado si cambia la estructura del root legacy', async () => {
  const legacy = await legacyRules();
  assert.throws(
    () => composeGateGReadRules(legacy.replace('      match /trips/{tripId} {', '')),
    /bloque trips v3/
  );
  assert.throws(
    () => composeGateGReadRules(legacy.replace('        match /revisions/{revisionId} {', '')),
    /bloque revisions v3/
  );
  assert.throws(
    () => composeGateGReadRules(legacy.replace(ROOT_DELETE, '        allow delete: if false;')),
    /delete legacy del root/
  );
});
