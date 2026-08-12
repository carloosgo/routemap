import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const scriptPath = new URL('../scripts/storage-v4-phase-k-restore-checkpoint-dev.ps1', import.meta.url);

test('restore checkpoint auto-selecciona solo backup READY de default', async () => {
  const source = await readFile(scriptPath, 'utf8');

  assert.ok(source.includes("$Project -ne 'atlasmap-dev'"));
  assert.ok(source.includes("$Location -ne 'northamerica-south1'"));
  assert.ok(source.includes("[string]$_.state -eq 'READY'"));
  assert.ok(source.includes("$expectedDatabase = \"projects/$Project/databases/(default)\""));
  assert.ok(source.includes('Sort-Object snapshotTime -Descending'));
});

test('restore checkpoint es dry-run por defecto y nunca limpia la base restaurada', async () => {
  const source = await readFile(scriptPath, 'utf8');

  assert.ok(source.includes('[switch]$Apply'));
  assert.ok(source.includes('if (-not $Apply)'));
  assert.ok(source.includes('costBearingChange = $true'));
  assert.ok(source.includes('deletesResources = $false'));
  assert.ok(source.includes('touchesDefaultDatabase = $false'));
  assert.ok(source.includes('enablesStorageV4Write = $false'));
  assert.ok(source.includes('touchesProduction = $false'));
  assert.equal(source.includes("'firestore', 'databases', 'delete'"), false);
});

test('restore checkpoint delega al drill aislado con destino atlas-restore-drill', async () => {
  const source = await readFile(scriptPath, 'utf8');

  assert.ok(source.includes("'atlas-restore-drill-'"));
  assert.ok(source.includes("'storage-v4-phase-k-restore-drill-dev.ps1'"));
  assert.ok(source.includes("-SourceDatabaseId '(default)'"));
  assert.ok(source.includes('-SourceBackup ([string]$selected.name)'));
  assert.ok(source.includes('-DestinationDatabase $destination'));
  assert.ok(source.includes('-Apply'));
});
