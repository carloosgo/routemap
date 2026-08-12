import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const scriptPath = new URL('../scripts/storage-v4-phase-k-restore-cleanup-dev.ps1', import.meta.url);
const launcherPath = new URL('../scripts/runStorageV4PhaseKRestoreCleanupDev.mjs', import.meta.url);

test('restore cleanup queda bloqueado a dev y dry-run por defecto', async () => {
  const source = await readFile(scriptPath, 'utf8');

  assert.ok(source.includes("$Project -ne 'atlasmap-dev'"));
  assert.ok(source.includes('[switch]$Apply'));
  assert.ok(source.includes('if (-not $Apply)'));
  assert.ok(source.includes('touchesDefaultDatabase = $false'));
  assert.ok(source.includes('touchesProduction = $false'));
  assert.ok(source.includes('enablesStorageV4Write = $false'));
});

test('restore cleanup solo elimina una base aislada con lineage y etag', async () => {
  const source = await readFile(scriptPath, 'utf8');

  assert.ok(source.includes("-like 'atlas-restore-drill-*'"));
  assert.ok(source.includes('$restoreDatabases.Count -ne 1'));
  assert.ok(source.includes('$detail.sourceInfo.backup.backup'));
  assert.ok(source.includes('$detail.sourceInfo.operation'));
  assert.ok(source.includes('$detail.etag'));
  assert.ok(source.includes('gcloud firestore databases delete'));
  assert.ok(source.includes('"--etag=$etag"'));
  assert.ok(source.includes('remainingRestoreDatabaseCount = 0'));
});

test('restore cleanup es idempotente cuando ya no existe base temporal', async () => {
  const source = await readFile(scriptPath, 'utf8');

  assert.ok(source.includes('$restoreDatabases.Count -eq 0'));
  assert.ok(source.includes('alreadyClean = $true'));
  assert.ok(source.includes('entorno ya limpio'));
});

test('restore cleanup no puede borrar default ni recursos vecinos', async () => {
  const source = await readFile(scriptPath, 'utf8');

  assert.ok(source.includes("$databaseId -eq '(default)'"));
  assert.equal(source.includes('logging metrics delete'), false);
  assert.equal(source.includes('monitoring policies delete'), false);
  assert.doesNotMatch(source, /billing[\s'",]+budgets[\s'",]+(create|update|delete)/i);
});

test('restore cleanup launcher usa cmd.exe para wrappers .cmd en Windows sin depender de PowerShell', async () => {
  const source = await readFile(launcherPath, 'utf8');

  assert.ok(source.includes("['gcloud.cmd', 'gcloud.exe', 'gcloud']"));
  assert.ok(source.includes("['gcloud']"));
  assert.ok(source.includes("executable.toLowerCase().endsWith('.cmd')"));
  assert.ok(source.includes("process.env.ComSpec || 'cmd.exe'"));
  assert.ok(source.includes("['/d', '/c', executable, ...args]"));
  assert.ok(source.includes("'firestore', 'databases', 'delete'"));
  assert.ok(source.includes('`--etag=${etag}`'));
  assert.ok(source.includes("destinationDatabase === '(default)'"));
  assert.doesNotMatch(source, /pwsh|powershell/i);
});
