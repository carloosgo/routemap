import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const scriptPath = new URL('../scripts/storage-v4-phase-k-sync-unexpected-errors-diagnose-dev.ps1', import.meta.url);

test('sync unexpected-error diagnosis is hard-bound to dev and read-only', async () => {
  const source = await readFile(scriptPath, 'utf8');

  assert.match(source, /\[string\]\$Project = 'atlasmap-dev'/);
  assert.match(source, /if \(\$Project -ne 'atlasmap-dev'\)/);
  assert.match(source, /gcloud logging read/);
  assert.match(source, /jsonPayload\.outcome=\"unexpected-error\"/);
  assert.doesNotMatch(source, /logging write|firestore .*update|Invoke-RestMethod -Method (Post|Put|Patch|Delete)/i);
  assert.match(source, /mutatesCloud = \$false/);
  assert.match(source, /mutatesApplicationData = \$false/);
  assert.match(source, /touchesProduction = \$false/);
});

test('sync unexpected-error diagnosis emits only safe operational fields', async () => {
  const source = await readFile(scriptPath, 'utf8');

  for (const field of ['timestamp', 'event', 'outcome', 'reason', 'errorName', 'errorCode', 'durationMs', 'pending']) {
    assert.match(source, new RegExp(`\\b${field}\\s*=`));
  }
  assert.match(source, /fieldsIntentionallyOmitted/);
  assert.match(source, /'userId'/);
  assert.match(source, /'tripId'/);
  assert.match(source, /'payload'/);
  assert.match(source, /'errorMessage'/);
});
