import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import {
  PILOT_STAGE_RECOVERY_CONFIRMATION,
  buildPilotStageRecoveryPlan,
  buildPilotStageSnapshot,
  parsePilotStageSafetyArgs,
} from '../scripts/runStorageV4PilotStageSafetyDev.mjs';

const ORIGINAL = 'projects/atlasmap-dev/rulesets/original-123';
const CANDIDATE = 'projects/atlasmap-dev/rulesets/candidate-456';
const originalSource = 'rules_version = \'2\';\n// original';
const candidateSource = 'rules_version = \'2\';\n// candidate';
const sha = (value) => createHash('sha256').update(value, 'utf8').digest('hex');
const ruleset = (name, content) => ({
  name,
  source: { files: [{ name: 'firestore.rules', content }] },
});
const safeOff = () => ({
  enabled: 'false',
  killSwitch: 'true',
  mode: 'off',
  cohortPercent: '0',
});

test('stage safety snapshot es read-only y captura original + candidato', () => {
  const result = buildPilotStageSnapshot({
    activeRuleset: ruleset(ORIGINAL, originalSource),
    candidateRules: candidateSource,
    remoteConfigSummary: safeOff(),
  });
  assert.equal(result.originalRulesetName, ORIGINAL);
  assert.equal(result.originalSourceSha256, sha(originalSource));
  assert.equal(result.candidateSourceSha256, sha(candidateSource));
  assert.equal(result.remoteConfigSafeOff, true);
  assert.equal(result.mutatesCloud, false);
  assert.equal(result.activatesClientPilotTraffic, false);
});

test('recovery distingue original de candidato y aborta ante tercer estado', () => {
  const base = {
    originalRulesetName: ORIGINAL,
    originalSourceSha256: sha(originalSource),
    candidateSourceSha256: sha(candidateSource),
    remoteConfigSummary: safeOff(),
  };
  const original = buildPilotStageRecoveryPlan({
    ...base,
    activeRuleset: ruleset(ORIGINAL, originalSource),
  });
  assert.equal(original.currentIsOriginal, true);
  assert.equal(original.patchNeeded, false);

  const candidate = buildPilotStageRecoveryPlan({
    ...base,
    activeRuleset: ruleset(CANDIDATE, candidateSource),
  });
  assert.equal(candidate.currentIsCandidate, true);
  assert.equal(candidate.patchNeeded, true);

  assert.throws(() => buildPilotStageRecoveryPlan({
    ...base,
    activeRuleset: ruleset('projects/atlasmap-dev/rulesets/drift', '// drift'),
  }), /drift/);
});

test('recovery falla cerrado si Remote Config no está OFF', () => {
  assert.throws(() => buildPilotStageRecoveryPlan({
    activeRuleset: ruleset(CANDIDATE, candidateSource),
    originalRulesetName: ORIGINAL,
    originalSourceSha256: sha(originalSource),
    candidateSourceSha256: sha(candidateSource),
    remoteConfigSummary: {
      enabled: 'true',
      killSwitch: 'false',
      mode: 'pilot',
      cohortPercent: '1',
    },
  }), /Remote Config/);
});

test('apply de recovery exige confirmación explícita y snapshot exacto', () => {
  assert.deepEqual(parsePilotStageSafetyArgs([]), {
    recover: false,
    apply: false,
    originalRulesetName: '',
    originalSourceSha256: '',
    candidateSourceSha256: '',
    confirmation: '',
  });
  assert.throws(() => parsePilotStageSafetyArgs(['--apply']), /--recover/);
  assert.throws(() => parsePilotStageSafetyArgs(['--recover']), /original-ruleset/);

  const parsed = parsePilotStageSafetyArgs([
    '--recover',
    '--apply',
    `--original-ruleset=${ORIGINAL}`,
    `--original-source-sha256=${sha(originalSource)}`,
    `--candidate-source-sha256=${sha(candidateSource)}`,
    `--confirm=${PILOT_STAGE_RECOVERY_CONFIRMATION}`,
  ]);
  assert.equal(parsed.recover, true);
  assert.equal(parsed.apply, true);
});

test('recovery valida Ruleset original antes del PATCH y no toca Functions ni Remote Config', async () => {
  const source = await readFile(
    new URL('../scripts/runStorageV4PilotStageSafetyDev.mjs', import.meta.url),
    'utf8'
  );
  const readOriginalAt = source.indexOf('readRulesetByName({');
  const patchAt = source.indexOf('patchRelease({');
  assert.ok(readOriginalAt >= 0);
  assert.ok(patchAt > readOriginalAt);
  assert.match(source, /observedOriginalSourceSha256/);
  assert.doesNotMatch(source, /publishRemoteConfigTemplate/);
  assert.doesNotMatch(source, /firebase[^\n]*deploy/);
  assert.doesNotMatch(source, /functions\.delete|deleteFunction/);
});
