import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const preflightPath = new URL('../scripts/storage-v4-phase-k-restore-preflight.ps1', import.meta.url);
const drillPath = new URL('../scripts/storage-v4-phase-k-restore-drill-dev.ps1', import.meta.url);

test('restore preflight es read-only y queda bloqueado al entorno dev', async () => {
  const source = await readFile(preflightPath, 'utf8');

  assert.ok(source.includes("$Project -ne 'atlasmap-dev'"));
  assert.ok(source.includes("$Location -ne 'northamerica-south1'"));
  assert.ok(source.includes("'firestore', 'backups', 'list'"));
  assert.ok(source.includes("'firestore', 'databases', 'list'"));
  for (const mutation of ["'restore'", "'create'", "'update'", "'delete'"]) {
    assert.equal(source.includes(mutation), false);
  }
  assert.doesNotMatch(source, /atlasmap-prod|production-project|prod-project/i);
});

test('restore drill requiere Apply, backup explicito y destino aislado', async () => {
  const source = await readFile(drillPath, 'utf8');

  assert.ok(source.includes('[switch]$Apply'));
  assert.ok(source.includes('if (-not $Apply)'));
  assert.ok(source.includes('if (-not $SourceBackup)'));
  assert.ok(source.includes('if (-not $DestinationDatabase)'));
  assert.ok(source.includes("$DestinationDatabase -eq '(default)'"));
  assert.ok(source.includes("StartsWith('atlas-restore-drill-')"));
  assert.ok(source.includes('SourceBackup indicado no esta READY'));
  assert.ok(source.includes('DestinationDatabase ya existe'));
});

test('restore drill usa restore oficial y nunca contiene cleanup destructivo', async () => {
  const source = await readFile(drillPath, 'utf8');

  assert.ok(source.includes("'firestore', 'databases', 'restore'"));
  assert.ok(source.includes('"--source-backup=$SourceBackup"'));
  assert.ok(source.includes('"--destination-database=$DestinationDatabase"'));
  assert.ok(source.includes('costBearingChange = $true'));
  assert.ok(source.includes('cleanupPerformed = $false'));
  assert.ok(source.includes('cleanupRequiresSeparateDecision = $true'));
  assert.equal(source.includes("'firestore', 'databases', 'delete'"), false);
  assert.equal(source.includes("'firestore', 'backups', 'delete'"), false);
  assert.doesNotMatch(source, /atlasmap-prod|production-project|prod-project/i);
  assert.equal(source.includes('touchesDefaultDatabase = $true'), false);
  assert.equal(source.includes('enablesStorageV4Write = $true'), false);
});
