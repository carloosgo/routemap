/* global process, console */
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Buffer } from 'node:buffer';
import {
  V4_PILOT_BACKEND_FUNCTION_NAMES,
  V4_PILOT_BACKEND_REGION,
} from '../functions/v4PilotBackendManifest.js';
import { GATE_G_REMOTE_KEYS } from '../src/modules/storage-v4/gateGRuntimeConfigModel.js';
import { composePilotWriteRules } from './firestorePilotWriteRules.mjs';

export const V4_PILOT_PLAN_PROJECT = 'atlasmap-dev';

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = dirname(here);
const PILOT_READINESS_FIELDS = Object.freeze([
  'readRulesReady',
  'writeRulesReady',
  'syncReady',
  'aggregateReady',
  'touchReady',
  'lifecycleReady',
  'purgeReady',
]);

function sha256(value) {
  return createHash('sha256').update(value, 'utf8').digest('hex');
}

function allFunctionExportsPrepared(source) {
  return V4_PILOT_BACKEND_FUNCTION_NAMES.every((name) => (
    new RegExp(`export const ${name}\\s*=`).test(source)
  ));
}

function indexActivatesPilot(indexSource) {
  return /v4PilotExports\.js/.test(indexSource)
    || V4_PILOT_BACKEND_FUNCTION_NAMES.some((name) => (
      new RegExp(`\\b${name}\\b`).test(indexSource)
    ));
}

export function buildStorageV4PilotPlan({
  v3Rules,
  v4Rules,
  indexSource,
  pilotExportsSource,
} = {}) {
  const candidateRules = composePilotWriteRules(v3Rules, v4Rules);
  const exportsPrepared = allFunctionExportsPrepared(pilotExportsSource || '');
  const exportsActivated = indexActivatesPilot(indexSource || '');
  const readinessRemoteKeys = Object.fromEntries(
    PILOT_READINESS_FIELDS.map((field) => [field, GATE_G_REMOTE_KEYS[field]])
  );

  return Object.freeze({
    project: V4_PILOT_PLAN_PROJECT,
    mode: 'plan',
    candidateRules: {
      sha256: sha256(candidateRules),
      bytes: Buffer.byteLength(candidateRules, 'utf8'),
      preservesLegacyStorageVersions: [2, 3],
      targetSchemaVersion: 4,
      v4RootHardDeleteAllowed: false,
    },
    backend: {
      region: V4_PILOT_BACKEND_REGION,
      functionCount: V4_PILOT_BACKEND_FUNCTION_NAMES.length,
      functionNames: [...V4_PILOT_BACKEND_FUNCTION_NAMES],
      exportsPrepared,
      exportsActivatedInIndex: exportsActivated,
    },
    rollout: {
      requiredReadinessFields: [...PILOT_READINESS_FIELDS],
      remoteKeys: readinessRemoteKeys,
      activationKeys: {
        enabled: GATE_G_REMOTE_KEYS.enabled,
        killSwitch: GATE_G_REMOTE_KEYS.killSwitch,
        mode: GATE_G_REMOTE_KEYS.mode,
        cohortPercent: GATE_G_REMOTE_KEYS.cohortPercent,
      },
      cohortPercentChosen: false,
      pilotTrafficActivated: false,
    },
    nextActivationSequence: [
      'activate-pilot-exports-in-functions-index',
      'deploy-exact-pilot-functions',
      'apply-composed-pilot-write-rules',
      'verify-backend-and-rules',
      'mark-readiness-flags',
      'choose-explicit-pilot-cohort',
      'disable-kill-switch-and-enter-pilot',
    ],
    codePrepared: exportsPrepared && !exportsActivated,
    mutatesCloud: false,
    mutatesApplicationData: false,
    enablesGlobalStorageV4Write: false,
    touchesProduction: false,
  });
}

export async function runStorageV4PilotPlanDev({ log = (value) => console.log(value) } = {}) {
  if (typeof log !== 'function') throw new TypeError('log debe ser función.');
  const [v3Rules, v4Rules, indexSource, pilotExportsSource] = await Promise.all([
    readFile(join(repoRoot, 'firestore.rules'), 'utf8'),
    readFile(join(repoRoot, 'firestore-v4.rules'), 'utf8'),
    readFile(join(repoRoot, 'functions', 'index.js'), 'utf8'),
    readFile(join(repoRoot, 'functions', 'v4PilotExports.js'), 'utf8'),
  ]);
  const plan = buildStorageV4PilotPlan({
    v3Rules,
    v4Rules,
    indexSource,
    pilotExportsSource,
  });
  log(JSON.stringify(plan, null, 2));
  log('Plan local: no se modificó Firebase, Remote Config ni Firestore.');
  return plan;
}

const invokedPath = process.argv[1] ? resolve(process.argv[1]) : '';
const modulePath = resolve(fileURLToPath(import.meta.url));
if (invokedPath === modulePath) {
  runStorageV4PilotPlanDev().catch((error) => {
    console.error(error?.message || error);
    process.exitCode = 1;
  });
}
