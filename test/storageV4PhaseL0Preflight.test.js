/* global process */
import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const scriptPath = fileURLToPath(
  new URL('../scripts/runStorageV4PhaseL0Preflight.mjs', import.meta.url)
);

function run(args = []) {
  return spawnSync(process.execPath, [scriptPath, ...args], {
    encoding: 'utf8',
    windowsHide: true,
  });
}

test('L0 exige project y location explícitos', () => {
  assert.notEqual(run().status, 0);
  assert.match(run().stderr, /--project es obligatorio/);

  const onlyProject = run(['--project=atlasmap-prod']);
  assert.notEqual(onlyProject.status, 0);
  assert.match(onlyProject.stderr, /--location es obligatorio/);
});

test('L0 rechaza atlasmap-dev y cualquier apply implícito', () => {
  const dev = run(['--project=atlasmap-dev', '--location=northamerica-south1']);
  assert.notEqual(dev.status, 0);
  assert.match(dev.stderr, /rechaza atlasmap-dev/);

  const apply = run([
    '--project=atlasmap-prod',
    '--location=northamerica-south1',
    '--apply',
  ]);
  assert.notEqual(apply.status, 0);
  assert.match(apply.stderr, /Argumento desconocido: --apply/);
});

test('L0 local-plan no toca Cloud ni autoriza mutación productiva', () => {
  const result = run([
    '--project=atlasmap-prod',
    '--location=northamerica-south1',
  ]);
  assert.equal(result.status, 0, result.stderr);
  const plan = JSON.parse(result.stdout);
  assert.equal(plan.phase, 'L0');
  assert.equal(plan.mode, 'local-plan');
  assert.equal(plan.project, 'atlasmap-prod');
  assert.equal(plan.location, 'northamerica-south1');
  assert.equal(plan.refusesDevProject, true);
  assert.equal(plan.mutatesCloud, false);
  assert.equal(plan.changesIam, false);
  assert.equal(plan.changesBilling, false);
  assert.equal(plan.changesFirestore, false);
  assert.equal(plan.changesRemoteConfig, false);
  assert.equal(plan.deploysFunctions, false);
  assert.equal(plan.enablesStorageV4Write, false);
  assert.equal(plan.productionMutationAuthorized, false);
});
