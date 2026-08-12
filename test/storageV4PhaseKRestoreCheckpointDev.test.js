import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const scriptPath = new URL('../scripts/storage-v4-phase-k-restore-checkpoint-dev.ps1', import.meta.url);
const validatorPath = new URL('../scripts/validateStorageV4PhaseKRestore.mjs', import.meta.url);

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
  assert.ok(source.includes('costBearingChange = -not $resumeExisting'));
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

test('restore checkpoint reanuda una unica base restaurada usando sourceInfo sin crear otra', async () => {
  const source = await readFile(scriptPath, 'utf8');

  assert.ok(source.includes('$existingDrills.Count -gt 1'));
  assert.ok(source.includes('$resumeExisting = $existingDrills.Count -eq 1'));
  assert.ok(source.includes('$existingDetail.sourceInfo.backup.backup'));
  assert.ok(source.includes('no se crea una segunda base ni se repite el restore'));
  assert.ok(source.includes('managedRestoreLineageVerified'));
});

test('restore checkpoint espera la long-running operation antes de leer documentos', async () => {
  const source = await readFile(scriptPath, 'utf8');

  assert.ok(source.includes('function Wait-FirestoreRestoreOperation'));
  assert.ok(source.includes("'firestore', 'operations', 'describe'"));
  assert.ok(source.includes('$operation.done'));
  assert.ok(source.includes('$operation.error'));
  assert.ok(source.includes('Start-Sleep -Seconds $PollSeconds'));
  assert.ok(source.includes('Wait-FirestoreRestoreOperation'));
  assert.ok(source.indexOf('Wait-FirestoreRestoreOperation') < source.indexOf('$validator = Join-Path'));
  assert.ok(source.includes('restoreOperationCompletionVerified = $true'));
});

test('restore validator exige paridad exacta solo cuando Firestore puede consultar el snapshot exacto', async () => {
  const source = await readFile(validatorPath, 'utf8');

  assert.ok(source.includes('const ONE_HOUR_MS = 60 * 60 * 1000'));
  assert.ok(source.includes("validationMode: 'exact-source-parity'"));
  assert.ok(source.includes("validationMode: 'managed-restore-readability'"));
  assert.ok(source.includes('sourceParityAttempted: false'));
  assert.ok(source.includes('Backup snapshot is older than one hour and not a whole-minute timestamp'));
  assert.equal(source.includes('parsed.setUTCSeconds(0, 0)'), false);
});

test('restore validator siempre inventaria destino y no expone contenido', async () => {
  const source = await readFile(validatorPath, 'utf8');

  assert.ok(source.includes('const destination = await inventoryDatabase'));
  assert.ok(source.includes('destinationReadable: true'));
  assert.ok(source.includes('exposesDocumentContent: false'));
  assert.ok(source.includes('managedRestoreLineageMustBeVerifiedByCaller'));
});
