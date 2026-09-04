import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const scriptPath = new URL('../scripts/runStorageV4PhaseKRecoveryCheckpointDev.mjs', import.meta.url);

test('recovery checkpoint agrupa cleanup de dashboard y restore drill', async () => {
  const source = await readFile(scriptPath, 'utf8');

  assert.ok(source.includes('runStorageV4PhaseKDashboardCleanupDev.mjs'));
  assert.ok(source.includes('runStorageV4PhaseKRestoreCheckpointDev.mjs'));
  assert.ok(source.includes("project: 'atlasmap-dev'"));
  assert.ok(source.includes('deletesOnlyVerifiedDuplicateDashboard: true'));
  assert.ok(source.includes('createsTemporaryRestoreDatabase: true'));
  assert.ok(source.includes('validatesRestoredContent: true'));
  assert.ok(source.includes('mutatesBudgets: false'));
  assert.ok(source.includes('enablesStorageV4Write: false'));
  assert.ok(source.includes('touchesDefaultDatabase: false'));
  assert.ok(source.includes('touchesProduction: false'));
  assert.ok(source.includes('restoreDatabaseCleanupAutomatic: false'));
});

test('recovery checkpoint solo propaga apply cuando se solicita explicitamente', async () => {
  const source = await readFile(scriptPath, 'utf8');

  assert.ok(source.includes("includes('--apply')"));
  assert.ok(source.includes("if (applyRequested) args.push('--apply')"));
});
