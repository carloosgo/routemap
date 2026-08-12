/* global process, console */
import { createHash } from 'node:crypto';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { V4_PILOT_BACKEND_FUNCTION_NAMES } from '../functions/v4PilotBackendManifest.js';
import { composePilotWriteRules } from './firestorePilotWriteRules.mjs';

export const PILOT_STAGE_PROJECT = 'atlasmap-dev';
export const PILOT_STAGE_CONFIRMATION = 'STAGE-ATLAS-V4-PILOT-DEV';

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = dirname(here);
const generatedRulesPath = join(repoRoot, 'firestore-pilot-write.rules');
const pilotConfigPath = join(repoRoot, 'firebase.pilot-write.json');

function sha256(value) {
  return createHash('sha256').update(value, 'utf8').digest('hex');
}

function argumentValue(args, name) {
  const prefix = `${name}=`;
  const matches = args.filter((value) => value.startsWith(prefix));
  if (matches.length > 1) throw new TypeError(`${name} no puede repetirse.`);
  return matches.length === 1 ? matches[0].slice(prefix.length).trim() : '';
}

export function parsePilotStageArgs(args = []) {
  const allowed = new Set(['--apply']);
  for (const value of args) {
    if (allowed.has(value) || value.startsWith('--expected-rules-sha=') || value.startsWith('--confirm=')) {
      continue;
    }
    throw new TypeError(`Argumento desconocido: ${value}`);
  }
  const apply = args.includes('--apply');
  if (args.filter((value) => value === '--apply').length > 1) {
    throw new TypeError('--apply no puede repetirse.');
  }
  const expectedRulesSha = argumentValue(args, '--expected-rules-sha').toLowerCase();
  const confirmation = argumentValue(args, '--confirm');
  if (!apply && (expectedRulesSha || confirmation)) {
    throw new TypeError('--expected-rules-sha y --confirm solo se usan con --apply.');
  }
  if (apply) {
    if (!/^[a-f0-9]{64}$/.test(expectedRulesSha)) {
      throw new TypeError('--apply exige --expected-rules-sha=<sha256 del plan>.');
    }
    if (confirmation !== PILOT_STAGE_CONFIRMATION) {
      throw new TypeError(`--apply exige --confirm=${PILOT_STAGE_CONFIRMATION}.`);
    }
  }
  return Object.freeze({ apply, expectedRulesSha, confirmation });
}

function resolveFirebaseCliScript() {
  const packageJsonPath = join(repoRoot, 'node_modules', 'firebase-tools', 'package.json');
  if (!existsSync(packageJsonPath)) return null;
  try {
    const packageJson = JSON.parse(readFileSync(packageJsonPath, 'utf8'));
    const binEntry = typeof packageJson.bin === 'string' ? packageJson.bin : packageJson.bin?.firebase;
    if (!binEntry) return null;
    const cliScript = join(dirname(packageJsonPath), binEntry);
    return existsSync(cliScript) ? cliScript : null;
  } catch {
    return null;
  }
}

function indexActivatesPilot(indexSource) {
  return /v4PilotExports\.js/.test(indexSource)
    || V4_PILOT_BACKEND_FUNCTION_NAMES.every((name) => new RegExp(`\\b${name}\\b`).test(indexSource));
}

export function buildPilotStageDeployPlan({ v3Rules, v4Rules, indexSource } = {}) {
  if (typeof v3Rules !== 'string' || typeof v4Rules !== 'string' || typeof indexSource !== 'string') {
    throw new TypeError('Se requieren Rules v3/v4 e index.js como texto.');
  }
  const candidateRules = composePilotWriteRules(v3Rules, v4Rules);
  const rulesSha = sha256(candidateRules);
  const exportsActivated = indexActivatesPilot(indexSource);
  return Object.freeze({
    project: PILOT_STAGE_PROJECT,
    mode: 'stage-plan',
    rulesSha256: rulesSha,
    rulesBytes: Buffer.byteLength(candidateRules, 'utf8'),
    functions: [...V4_PILOT_BACKEND_FUNCTION_NAMES],
    functionCount: V4_PILOT_BACKEND_FUNCTION_NAMES.length,
    pilotExportsActivatedInIndex: exportsActivated,
    applyBlockedUntilExportsActivated: !exportsActivated,
    deploymentOrder: ['functions', 'firestore-rules'],
    remoteConfigChanged: false,
    pilotTrafficActivated: false,
    enablesGlobalStorageV4Write: false,
    touchesProduction: false,
    candidateRules,
  });
}

function runFirebase(firebaseCliScript, args) {
  const result = spawnSync(process.execPath, [firebaseCliScript, ...args], {
    cwd: repoRoot,
    stdio: 'inherit',
    windowsHide: true,
  });
  if (result.error) throw result.error;
  if ((result.status ?? 1) !== 0) {
    throw new Error(`Firebase CLI terminó con código ${result.status ?? 1}.`);
  }
}

export function runPilotStageDeployDev({
  args = process.argv.slice(2),
  v3Rules = readFileSync(join(repoRoot, 'firestore.rules'), 'utf8'),
  v4Rules = readFileSync(join(repoRoot, 'firestore-v4.rules'), 'utf8'),
  indexSource = readFileSync(join(repoRoot, 'functions', 'index.js'), 'utf8'),
  firebaseCliScript = resolveFirebaseCliScript(),
  executeFirebase = runFirebase,
  writeGeneratedRules = (content) => writeFileSync(generatedRulesPath, content, 'utf8'),
  log = (value) => console.log(value),
} = {}) {
  const options = parsePilotStageArgs(args);
  const plan = buildPilotStageDeployPlan({ v3Rules, v4Rules, indexSource });
  const visiblePlan = {
    ...plan,
    candidateRules: undefined,
    applyRequested: options.apply,
  };
  log(JSON.stringify(visiblePlan, null, 2));

  if (!options.apply) {
    log('Dry-run: no se desplegó ninguna Function ni Rules.');
    return visiblePlan;
  }
  if (!plan.pilotExportsActivatedInIndex) {
    throw new Error('Apply bloqueado: functions/index.js todavía no activa v4PilotExports.js.');
  }
  if (options.expectedRulesSha !== plan.rulesSha256) {
    throw new Error('El SHA de Rules ya no coincide con el plan aprobado. Repite el plan antes de desplegar.');
  }
  if (!firebaseCliScript) {
    throw new Error('No se encontró Firebase CLI local. Ejecuta npm install en la raíz del proyecto.');
  }
  if (!existsSync(pilotConfigPath)) {
    throw new Error('Falta firebase.pilot-write.json.');
  }

  writeGeneratedRules(plan.candidateRules);
  const onlyFunctions = V4_PILOT_BACKEND_FUNCTION_NAMES.map((name) => `functions:${name}`).join(',');

  executeFirebase(firebaseCliScript, [
    'deploy',
    '--only',
    onlyFunctions,
    '--project',
    PILOT_STAGE_PROJECT,
    '--non-interactive',
  ]);

  executeFirebase(firebaseCliScript, [
    'deploy',
    '--config',
    pilotConfigPath,
    '--only',
    'firestore:rules',
    '--project',
    PILOT_STAGE_PROJECT,
    '--non-interactive',
  ]);

  const result = Object.freeze({
    project: PILOT_STAGE_PROJECT,
    mode: 'staged',
    rulesSha256: plan.rulesSha256,
    functionCount: plan.functionCount,
    remoteConfigChanged: false,
    pilotTrafficActivated: false,
    enablesGlobalStorageV4Write: false,
    touchesProduction: false,
  });
  log(JSON.stringify(result, null, 2));
  return result;
}

const invokedPath = process.argv[1] ? resolve(process.argv[1]) : '';
const modulePath = resolve(fileURLToPath(import.meta.url));
if (invokedPath === modulePath) {
  try {
    runPilotStageDeployDev();
  } catch (error) {
    console.error(error?.message || error);
    process.exitCode = 1;
  }
}
