/* global process */
import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const scriptPath = fileURLToPath(
  new URL('../scripts/runStorageV4PhaseL0CreateProductionProject.mjs', import.meta.url)
);
const source = readFileSync(scriptPath, 'utf8');

function run(args = []) {
  return spawnSync(process.execPath, [scriptPath, ...args], {
    encoding: 'utf8',
    windowsHide: true,
  });
}

test('production bootstrap exige project y location explícitos', () => {
  const missingProject = run();
  assert.notEqual(missingProject.status, 0);
  assert.match(missingProject.stderr, /--project es obligatorio/);

  const missingLocation = run(['--project=atlasmap-prod']);
  assert.notEqual(missingLocation.status, 0);
  assert.match(missingLocation.stderr, /--location es obligatorio/);
});

test('production bootstrap rechaza dev y Project IDs inválidos', () => {
  const dev = run(['--project=atlasmap-dev', '--location=northamerica-south1']);
  assert.notEqual(dev.status, 0);
  assert.match(dev.stderr, /rechaza atlasmap-dev/);

  const invalid = run(['--project=AtlasMap-PROD', '--location=northamerica-south1']);
  assert.notEqual(invalid.status, 0);
  assert.match(invalid.stderr, /Project ID válido/);
});

test('plan es no mutante y explicita protecciones productivas', () => {
  const result = run(['--project=atlasmap-prod', '--location=northamerica-south1']);
  assert.equal(result.status, 0, result.stderr);
  const value = JSON.parse(result.stdout);
  assert.equal(value.phase, 'L0');
  assert.equal(value.operation, 'create-production-project');
  assert.equal(value.mode, 'plan');
  assert.equal(value.productionInfrastructureMutation, false);
  assert.equal(value.reusesDevBillingAccountWithoutPrintingId, true);
  assert.equal(value.firestorePitrManagedInPhaseL2, true);
  assert.equal(value.firestoreDeleteProtectionEnabled, true);
  assert.equal(value.createsWebApp, false);
  assert.equal(value.deploysApplication, false);
  assert.equal(value.enablesStorageV4Write, false);
  assert.equal(value.mutatesApplicationData, false);
  assert.equal(value.automaticProjectDeletionOnFailure, false);
});

test('apply exige token ligado al Project ID exacto', () => {
  const missing = run([
    '--project=atlasmap-prod',
    '--location=northamerica-south1',
    '--apply',
  ]);
  assert.notEqual(missing.status, 0);
  assert.match(missing.stderr, /CREATE-ATLAS-V4-PROD-atlasmap-prod/);

  const wrong = run([
    '--project=atlasmap-prod',
    '--location=northamerica-south1',
    '--apply',
    '--confirm=CREATE-ATLAS-V4-PROD-other',
  ]);
  assert.notEqual(wrong.status, 0);
  assert.match(wrong.stderr, /CREATE-ATLAS-V4-PROD-atlasmap-prod/);
});

test('Windows prefiere gcloud por PATH y evita ejecutar una ruta .cmd con espacios como token de cmd.exe', () => {
  assert.match(source, /const candidates = \['gcloud\.cmd', 'gcloud\.exe', 'gcloud'\]/);
  assert.match(source, /candidates\.push\(join\(localAppData/);
  assert.doesNotMatch(source, /candidates\.unshift\(join\(localAppData/);
  assert.match(source, /const command = hasPath \? basename\(executable\) : executable/);
  assert.match(source, /cwd: dirname\(executable\)/);
});
