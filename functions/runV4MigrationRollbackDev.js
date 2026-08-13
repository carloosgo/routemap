/* global process */
import { createHash } from 'node:crypto';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { applicationDefault, getApps, initializeApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { rollbackFreshV4Migration } from './v4MigrationStore.js';
import { readFreshV4MigrationRollbackPreflight } from './v4MigrationRollbackPreflight.js';

export const V4_ROLLBACK_DEV_PROJECT = 'atlasmap-dev';
export const V4_ROLLBACK_CONFIRMATION = 'ROLLBACK-ATLAS-V4-DEV';

function requiredText(value, field, max = 256) {
  const normalized = typeof value === 'string' ? value.trim() : '';
  if (!normalized || normalized.length > max) {
    throw new TypeError(`${field} es obligatorio y debe tener máximo ${max} caracteres.`);
  }
  return normalized;
}

function argumentValue(args, name) {
  const prefix = `${name}=`;
  const matches = args.filter((value) => value.startsWith(prefix));
  if (matches.length > 1) throw new TypeError(`${name} no puede repetirse.`);
  return matches.length === 1 ? matches[0].slice(prefix.length).trim() : '';
}

function assertKnownArgs(args) {
  const allowedFlags = new Set(['--apply']);
  const allowedPrefixes = ['--uid=', '--trip-id=', '--expected-digest=', '--confirm='];
  for (const value of args) {
    if (allowedFlags.has(value)) continue;
    if (allowedPrefixes.some((prefix) => value.startsWith(prefix))) continue;
    throw new TypeError(`Argumento desconocido: ${value}`);
  }
}

function validDigest(value) {
  return /^[a-f0-9]{64}$/.test(value);
}

export function parseV4RollbackDevArgs(args = []) {
  if (!Array.isArray(args)) throw new TypeError('args debe ser un arreglo.');
  assertKnownArgs(args);
  const apply = args.includes('--apply');
  if (args.filter((value) => value === '--apply').length > 1) {
    throw new TypeError('--apply no puede repetirse.');
  }

  const uid = requiredText(argumentValue(args, '--uid'), '--uid', 128);
  const tripId = requiredText(argumentValue(args, '--trip-id'), '--trip-id', 128);
  const expectedDigest = argumentValue(args, '--expected-digest').toLowerCase();
  const confirmation = argumentValue(args, '--confirm');

  if (!apply && (expectedDigest || confirmation)) {
    throw new TypeError('--expected-digest y --confirm solo se usan junto con --apply.');
  }
  if (apply) {
    if (!validDigest(expectedDigest)) {
      throw new TypeError('--apply exige --expected-digest=<sha256 del preflight de rollback>.');
    }
    if (confirmation !== V4_ROLLBACK_CONFIRMATION) {
      throw new TypeError(`--apply exige --confirm=${V4_ROLLBACK_CONFIRMATION}.`);
    }
  }

  return Object.freeze({ apply, uid, tripId, expectedDigest, confirmation });
}

function targetFingerprint(uid, tripId) {
  return createHash('sha256')
    .update(`${V4_ROLLBACK_DEV_PROJECT}\n${uid}\n${tripId}`, 'utf8')
    .digest('hex')
    .slice(0, 16);
}

function adminDb() {
  const existing = getApps().find((app) => app.name === '[DEFAULT]');
  const app = existing || initializeApp({
    credential: applicationDefault(),
    projectId: V4_ROLLBACK_DEV_PROJECT,
  });
  const projectId = app.options?.projectId;
  if (projectId && projectId !== V4_ROLLBACK_DEV_PROJECT) {
    throw new Error(`Firebase Admin apunta a ${projectId}, no a ${V4_ROLLBACK_DEV_PROJECT}.`);
  }
  return getFirestore(app);
}

export async function runV4MigrationRollbackDev({
  args = process.argv.slice(2),
  db = null,
  readPreflight = readFreshV4MigrationRollbackPreflight,
  rollback = rollbackFreshV4Migration,
  log = (value) => console.log(value),
} = {}) {
  const options = parseV4RollbackDevArgs(args);
  if (typeof readPreflight !== 'function') throw new TypeError('readPreflight debe ser función.');
  if (typeof rollback !== 'function') throw new TypeError('rollback debe ser función.');
  if (typeof log !== 'function') throw new TypeError('log debe ser función.');
  const firestore = db || adminDb();

  let status;
  try {
    status = await readPreflight({
      db: firestore,
      userId: options.uid,
      tripId: options.tripId,
    });
  } catch (error) {
    if (!db && /credential|auth|permission|unauth/i.test(String(error?.message || error))) {
      throw new Error(
        'No se pudo leer atlasmap-dev con Application Default Credentials. '
        + 'Autentica ADC para la cuenta administradora antes de volver a ejecutar el comando.'
      );
    }
    throw error;
  }

  if (status?.rollbackEligible !== true || !validDigest(status?.expectedDigest || '')) {
    throw new Error('El preflight no confirmó un rollback fresco elegible.');
  }

  const preflight = Object.freeze({
    project: V4_ROLLBACK_DEV_PROJECT,
    mode: 'preflight',
    targetFingerprint: targetFingerprint(options.uid, options.tripId),
    sourceStorageVersion: status.sourceStorageVersion,
    targetSchemaVersion: status.targetSchemaVersion,
    targetVersion: status.targetVersion,
    checkpointState: status.checkpointState,
    entityCounts: status.entityCounts,
    aggregateContributionCount: status.aggregateContributionCount,
    expectedDigest: status.expectedDigest,
    rollbackEligible: true,
    mutatesCloud: false,
    mutatesApplicationData: false,
    enablesGlobalStorageV4Write: false,
    touchesProduction: false,
  });

  if (!options.apply) {
    log(JSON.stringify(preflight, null, 2));
    log('Preflight rollback: no se modificó Firestore.');
    return preflight;
  }

  if (preflight.expectedDigest !== options.expectedDigest) {
    throw new Error(
      'El digest v4 actual ya no coincide con el aprobado. Repite el preflight de rollback.'
    );
  }

  const result = await rollback({
    db: firestore,
    userId: options.uid,
    tripId: options.tripId,
  });
  if (result?.state !== 'rolled-back') {
    throw new Error('El rollback no terminó en el estado rolled-back esperado.');
  }

  const output = Object.freeze({
    project: V4_ROLLBACK_DEV_PROJECT,
    mode: 'apply',
    targetFingerprint: preflight.targetFingerprint,
    restoredStorageVersion: preflight.sourceStorageVersion,
    state: result.state,
    idempotentReplay: Boolean(result.idempotentReplay),
    mutatesCloud: true,
    mutatesApplicationData: true,
    physicallyCleansFreshV4Staging: true,
    enablesGlobalStorageV4Write: false,
    touchesProduction: false,
  });
  log(JSON.stringify(output, null, 2));
  return output;
}

const invokedPath = process.argv[1] ? resolve(process.argv[1]) : '';
const modulePath = resolve(fileURLToPath(import.meta.url));
if (invokedPath === modulePath) {
  runV4MigrationRollbackDev().catch((error) => {
    console.error(error?.message || error);
    process.exitCode = 1;
  });
}
