/* global process, console */
import { createHash } from 'node:crypto';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { applicationDefault, getApps, initializeApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { materializePersistedV3ToV4 } from './v4MigrationMaterializer.js';
import {
  migrateV3TripToV4,
  readPersistedV3MigrationSource,
  v4MigrationDigest,
} from './v4MigrationStore.js';

export const V4_MIGRATION_DEV_PROJECT = 'atlasmap-dev';
export const V4_MIGRATION_CONFIRMATION = 'MIGRATE-ATLAS-V4-DEV';

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

export function parseV4MigrationDevArgs(args = []) {
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
      throw new TypeError('--apply exige --expected-digest=<sha256 del preflight>.');
    }
    if (confirmation !== V4_MIGRATION_CONFIRMATION) {
      throw new TypeError(`--apply exige --confirm=${V4_MIGRATION_CONFIRMATION}.`);
    }
  }

  return Object.freeze({ apply, uid, tripId, expectedDigest, confirmation });
}

function targetFingerprint(uid, tripId) {
  return createHash('sha256')
    .update(`${V4_MIGRATION_DEV_PROJECT}\n${uid}\n${tripId}`, 'utf8')
    .digest('hex')
    .slice(0, 16);
}

function collectionCounts(materialized) {
  return Object.fromEntries(
    Object.entries(materialized.collections).map(([name, items]) => [name, items.length])
  );
}

export function buildV4MigrationDevPreflight({ uid, tripId, source }) {
  const safeUid = requiredText(uid, 'uid', 128);
  const safeTripId = requiredText(tripId, 'tripId', 128);
  const materialized = materializePersistedV3ToV4(source);
  const digest = v4MigrationDigest(materialized);

  return Object.freeze({
    project: V4_MIGRATION_DEV_PROJECT,
    mode: 'preflight',
    targetFingerprint: targetFingerprint(safeUid, safeTripId),
    sourceStorageVersion: materialized.source.storageVersion,
    sourceRevisionPresent: Boolean(materialized.source.activeRevision),
    entityCounts: collectionCounts(materialized),
    aggregateContributionCount: materialized.contributions.length,
    targetSchemaVersion: 4,
    expectedDigest: digest,
    mutatesCloud: false,
    mutatesApplicationData: false,
    enablesGlobalStorageV4Write: false,
    touchesProduction: false,
  });
}

function adminDb() {
  const existing = getApps().find((app) => app.name === '[DEFAULT]');
  const app = existing || initializeApp({
    credential: applicationDefault(),
    projectId: V4_MIGRATION_DEV_PROJECT,
  });
  const projectId = app.options?.projectId;
  if (projectId && projectId !== V4_MIGRATION_DEV_PROJECT) {
    throw new Error(`Firebase Admin apunta a ${projectId}, no a ${V4_MIGRATION_DEV_PROJECT}.`);
  }
  return getFirestore(app);
}

export async function runV4MigrationDev({
  args = process.argv.slice(2),
  db = null,
  readSource = readPersistedV3MigrationSource,
  migrate = migrateV3TripToV4,
  log = (value) => console.log(value),
} = {}) {
  const options = parseV4MigrationDevArgs(args);
  if (typeof readSource !== 'function') throw new TypeError('readSource debe ser función.');
  if (typeof migrate !== 'function') throw new TypeError('migrate debe ser función.');
  if (typeof log !== 'function') throw new TypeError('log debe ser función.');
  const firestore = db || adminDb();

  let source;
  try {
    source = await readSource({
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

  const preflight = buildV4MigrationDevPreflight({
    uid: options.uid,
    tripId: options.tripId,
    source,
  });

  if (!options.apply) {
    log(JSON.stringify(preflight, null, 2));
    log('Preflight: no se modificó Firestore.');
    return preflight;
  }

  if (preflight.expectedDigest !== options.expectedDigest) {
    throw new Error(
      'El digest actual ya no coincide con el aprobado. Repite el preflight antes de migrar.'
    );
  }

  const result = await migrate({
    db: firestore,
    userId: options.uid,
    tripId: options.tripId,
  });
  if (result?.state !== 'complete' || Number(result?.version) !== 1) {
    throw new Error('La migración no terminó en el estado complete/version 1 esperado.');
  }
  if (result?.digest && result.digest !== options.expectedDigest) {
    throw new Error('La migración completó con un digest distinto al aprobado.');
  }

  const output = Object.freeze({
    project: V4_MIGRATION_DEV_PROJECT,
    mode: 'apply',
    targetFingerprint: preflight.targetFingerprint,
    sourceStorageVersion: preflight.sourceStorageVersion,
    targetSchemaVersion: 4,
    expectedDigest: options.expectedDigest,
    state: result.state,
    version: result.version,
    idempotentReplay: Boolean(result.idempotentReplay),
    mutatesCloud: true,
    mutatesApplicationData: true,
    enablesGlobalStorageV4Write: false,
    touchesProduction: false,
  });
  log(JSON.stringify(output, null, 2));
  return output;
}

const invokedPath = process.argv[1] ? resolve(process.argv[1]) : '';
const modulePath = resolve(fileURLToPath(import.meta.url));
if (invokedPath === modulePath) {
  runV4MigrationDev().catch((error) => {
    console.error(error?.message || error);
    process.exitCode = 1;
  });
}
