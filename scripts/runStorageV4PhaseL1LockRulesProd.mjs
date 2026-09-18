/* global process, console, fetch */
import { existsSync, readFileSync, unlinkSync, writeFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { basename, dirname, join, resolve } from 'node:path';

const PROJECT = 'atlasmap-prod';
const LOCATION = 'us-central1';
const CONFIRMATION = 'LOCK-ATLAS-V4-PROD-L1-RULES';
const LOCKED_RULES_FILE = 'firestore.l1.prod.locked.rules';
const RULES_API = 'https://firebaserules.googleapis.com/v1';
const BILLING_ID_PATTERN = /\b[A-Z0-9]{6}-[A-Z0-9]{6}-[A-Z0-9]{6}\b/gi;
const BILLING_RESOURCE_PATTERN = /billingAccounts\/[A-Z0-9-]+/gi;

function fail(message, code = 1) {
  const error = new Error(message);
  error.exitCode = code;
  throw error;
}

function sanitize(value) {
  return String(value || '')
    .replace(BILLING_RESOURCE_PATTERN, 'billingAccounts/[REDACTED]')
    .replace(BILLING_ID_PATTERN, '[REDACTED-BILLING-ID]');
}

function argValue(args, name) {
  const prefix = `${name}=`;
  const matches = args.filter((value) => value.startsWith(prefix));
  if (matches.length > 1) fail(`${name} no puede repetirse.`, 2);
  return matches.length === 1 ? matches[0].slice(prefix.length).trim() : '';
}

function parseArgs(args = []) {
  for (const value of args) {
    if (value === '--apply' || value.startsWith('--confirm=')) continue;
    fail(`Argumento desconocido: ${value}`, 2);
  }
  const apply = args.includes('--apply');
  const confirm = argValue(args, '--confirm');
  if (!apply && confirm) fail('--confirm solo se admite junto con --apply.', 2);
  if (apply && confirm !== CONFIRMATION) {
    fail(`--apply exige --confirm=${CONFIRMATION}.`, 2);
  }
  return { apply };
}

function commandCandidates(name) {
  if (process.platform !== 'win32') return [name];
  const candidates = [`${name}.cmd`, `${name}.exe`, name];
  const localAppData = process.env.LOCALAPPDATA;
  if (name === 'gcloud' && localAppData) {
    candidates.push(join(localAppData, 'Google', 'Cloud SDK', 'google-cloud-sdk', 'bin', 'gcloud.cmd'));
  }
  return candidates;
}

function runProcess(executable, args, extra = {}) {
  const options = { encoding: 'utf8', windowsHide: true, stdio: 'pipe', ...extra };
  if (process.platform === 'win32' && executable.toLowerCase().endsWith('.cmd')) {
    const hasPath = executable.includes('\\') || executable.includes('/');
    const command = hasPath ? basename(executable) : executable;
    const cmdOptions = hasPath ? { ...options, cwd: dirname(executable) } : options;
    return spawnSync(process.env.ComSpec || 'cmd.exe', ['/d', '/c', command, ...args], cmdOptions);
  }
  return spawnSync(executable, args, options);
}

function resolveCommand(name) {
  for (const candidate of commandCandidates(name)) {
    if ((candidate.includes('\\') || candidate.includes('/')) && !existsSync(candidate)) continue;
    const probeArgs = name === 'gcloud' ? ['version'] : ['--version'];
    const probe = runProcess(candidate, probeArgs);
    if (!probe.error && probe.status === 0) return candidate;
  }
  return null;
}

function runChecked(executable, args, label) {
  const result = runProcess(executable, args);
  if (result.error) fail(`${label}: ${sanitize(result.error.message)}`);
  const stdout = String(result.stdout || '').trim();
  const stderr = String(result.stderr || '').trim();
  if (result.status !== 0) fail(`${label}: ${sanitize(stderr || stdout || `exit ${result.status}`)}`);
  return stdout;
}

async function requestJson(url, token) {
  const response = await fetch(url, {
    headers: {
      Authorization: `Bearer ${token}`,
      'x-goog-user-project': PROJECT,
    },
  });
  const text = await response.text();
  let payload = {};
  if (text) {
    try {
      payload = JSON.parse(text);
    } catch {
      payload = { raw: text.slice(0, 500) };
    }
  }
  if (!response.ok) {
    const detail = payload?.error?.message || payload?.raw || `${response.status} ${response.statusText}`;
    fail(`Rules API HTTP ${response.status}: ${sanitize(detail)}`);
  }
  return payload;
}

function normalizeRules(value) {
  return String(value || '').replace(/\r\n/g, '\n').trim();
}

function selectFirestoreRelease(releases) {
  const candidates = (Array.isArray(releases?.releases) ? releases.releases : [])
    .filter((release) => typeof release?.name === 'string' && release.name.includes('/releases/cloud.firestore'));
  const exact = candidates.find((release) => release.name.endsWith('/releases/cloud.firestore'));
  return exact || candidates[0] || null;
}

async function readCurrentFirestoreRelease(token) {
  const releases = await requestJson(`${RULES_API}/projects/${PROJECT}/releases?pageSize=100`, token);
  const release = selectFirestoreRelease(releases);
  if (!release) return null;
  if (typeof release.rulesetName !== 'string' || !release.rulesetName.startsWith(`projects/${PROJECT}/rulesets/`)) {
    fail('El release Firestore actual no referencia un ruleset válido del proyecto productivo.');
  }
  return {
    releaseName: release.name,
    rulesetName: release.rulesetName,
  };
}

async function verifyLockedRelease(token, expectedRules) {
  const current = await readCurrentFirestoreRelease(token);
  if (!current) fail('No se encontró un release Firestore después del deploy de reglas locked.');

  const ruleset = await requestJson(`${RULES_API}/${current.rulesetName}`, token);
  const files = Array.isArray(ruleset?.source?.files) ? ruleset.source.files : [];
  const deployedSource = files.map((file) => file?.content || '').join('\n');
  if (normalizeRules(deployedSource) !== normalizeRules(expectedRules)) {
    fail('El source server-side del ruleset activo no coincide exactamente con las reglas deny-all esperadas.');
  }

  return current;
}

async function main() {
  const { apply } = parseArgs(process.argv.slice(2));
  const lockedRulesPath = resolve(process.cwd(), LOCKED_RULES_FILE);
  if (!existsSync(lockedRulesPath)) fail(`No existe ${LOCKED_RULES_FILE}.`);
  const expectedRules = readFileSync(lockedRulesPath, 'utf8');
  if (!/allow read, write: if false;/.test(expectedRules)) {
    fail(`${LOCKED_RULES_FILE} no contiene el contrato deny-all esperado.`);
  }

  console.log(JSON.stringify({
    phase: 'L1',
    operation: 'lock-production-firestore-rules',
    mode: apply ? 'apply' : 'plan',
    project: PROJECT,
    location: LOCATION,
    rulesFile: LOCKED_RULES_FILE,
    denyAllClientReadsAndWrites: true,
    runsReadOnlyL1PreflightFirst: true,
    capturesPreviousRulesetPointer: true,
    enablesFirebaseRulesApiIfNeeded: apply,
    deploysOnlyFirestoreRules: apply,
    createsWebApp: false,
    changesAuth: false,
    changesIam: false,
    deploysFunctions: false,
    enablesStorageV4Write: false,
    mutatesApplicationData: false,
    productionSecurityMutation: apply,
    confirmationRequiredForApply: CONFIRMATION,
  }, null, 2));

  if (!apply) return;

  const preflight = runProcess(process.execPath, [
    resolve(process.cwd(), 'scripts', 'runStorageV4PhaseL1SecurityPreflightProd.mjs'),
    '--check-cloud',
  ]);
  if (preflight.error || preflight.status !== 0) {
    const detail = String(preflight.stderr || preflight.stdout || preflight.error?.message || '').trim();
    fail(`L1 preflight read-only no pasó; no se desplegaron reglas: ${sanitize(detail)}`);
  }
  console.log(JSON.stringify({ stage: 'preflight-pass', project: PROJECT }, null, 2));

  const gcloud = resolveCommand('gcloud');
  if (!gcloud) fail('No se encontró gcloud.');
  runChecked(gcloud, [
    'services', 'enable', 'firebaserules.googleapis.com',
    `--project=${PROJECT}`,
    '--quiet',
  ], 'No se pudo habilitar Firebase Rules API');
  console.log(JSON.stringify({ stage: 'rules-api-ready', project: PROJECT }, null, 2));

  const token = runChecked(gcloud, ['auth', 'print-access-token'], 'No se pudo obtener access token');
  const previous = await readCurrentFirestoreRelease(token);
  console.log(JSON.stringify({
    stage: 'rules-before',
    project: PROJECT,
    previousReleaseName: previous?.releaseName || null,
    previousRulesetName: previous?.rulesetName || null,
    previousRulesetPreservedServerSide: previous != null,
  }, null, 2));

  const firebaseCli = resolve(process.cwd(), 'node_modules', 'firebase-tools', 'lib', 'bin', 'firebase.js');
  if (!existsSync(firebaseCli)) {
    fail('No se encontró la Firebase CLI local en node_modules; ejecuta npm install antes del apply.');
  }

  const tempConfig = resolve(process.cwd(), `.firebase.l1.prod.${process.pid}.json`);
  try {
    writeFileSync(tempConfig, `${JSON.stringify({ firestore: { rules: LOCKED_RULES_FILE } }, null, 2)}\n`, 'utf8');
    runChecked(process.execPath, [
      firebaseCli,
      'deploy',
      '--only', 'firestore:rules',
      '--project', PROJECT,
      '--config', tempConfig,
      '--non-interactive',
    ], 'Firebase deploy de reglas L1 falló');
    console.log(JSON.stringify({ stage: 'rules-deployed', project: PROJECT, denyAll: true }, null, 2));
  } finally {
    if (existsSync(tempConfig)) unlinkSync(tempConfig);
  }

  const verification = await verifyLockedRelease(token, expectedRules);
  console.log(JSON.stringify({
    phase: 'L1',
    pass: true,
    project: PROJECT,
    firestoreRulesLocked: true,
    denyAllClientReadsAndWrites: true,
    serverSideRulesSourceMatched: true,
    releaseName: verification.releaseName,
    rulesetName: verification.rulesetName,
    previousReleaseName: previous?.releaseName || null,
    previousRulesetName: previous?.rulesetName || null,
    rollbackPointerRecorded: previous != null,
    webAppCreated: false,
    authChanged: false,
    iamChanged: false,
    functionsDeployed: false,
    storageV4WriteEnabled: false,
    applicationDataMutated: false,
  }, null, 2));
}

main().catch((error) => {
  console.error(sanitize(error?.stack || error?.message || error));
  process.exitCode = error?.exitCode || 1;
});
