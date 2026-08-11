import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const preflightPath = new URL('../scripts/storage-v4-phase-k-restore-preflight.ps1', import.meta.url);
const drillPath = new URL('../scripts/storage-v4-phase-k-restore-drill-dev.ps1', import.meta.url);

test('restore preflight es read-only y queda bloqueado al entorno dev', async () => {
  const source = await readFile(preflightPath, 'utf8');

  assert.match(source, /\$Project -ne 'atlasmap-dev'/);
  assert.match(source, /\$Location -ne 'northamerica-south1'/);
  assert.match(source, /'firestore', 'backups', 'list'/);
  assert.match(source, /'firestore', 'databases', 'list'/);
  assert.doesNotMatch(source, /'restore'|'create'|'update'|'delete'/i);
  assert.doesNotMatch(source, /atlasmap-prod|production-project|prod-project/i);
});

test('restore drill requiere Apply, backup explicito y destino aislado', async () => {
  const source = await readFile(drillPath, 'utf8');

  assert.match(source, /\[switch\]\$Apply/);
  assert.match(source, /if \(-not \$Apply\)/);
  assert.match(source, /if \(-not \$SourceBackup\)/);
  assert.match(source, /if \(-not \$DestinationDatabase\)/);
  assert.match(source, /\$DestinationDatabase -eq '\(default\)'/);
  assert.match(source, /StartsWith\('atlas-restore-drill-'\)/);
  assert.match(source, /SourceBackup indicado no esta READY/);
  assert.match(source, /DestinationDatabase ya existe/);
});

test('restore drill usa restore oficial y nunca contiene cleanup destructivo', async () => {
  const source = await readFile(drillPath, 'utf8');

  assert.match(source, /'firestore', 'databases', 'restore'/);
  assert.match(source, /"--source-backup=\$SourceBackup"/);
  assert.match(source, /"--destination-database=\$DestinationDatabase"/);
  assert.match(source, /costBearingChange = \$true/);
  assert.match(source, /cleanupPerformed = \$false/);
  assert.match(source, /cleanupRequiresSeparateDecision = \$true/);
  assert.doesNotMatch(source, /'firestore', 'databases', 'delete'/i);
  assert.doesNotMatch(source, /'firestore', 'backups', 'delete'/i);
  assert.doesNotMatch(source, /atlasmap-prod|production-project|prod-project/i);
  assert.doesNotMatch(source, /touchesDefaultDatabase = \$true/i);
  assert.doesNotMatch(source, /enablesStorageV4Write = \$true/i);
});
