/* global process, console */
import { randomUUID } from 'node:crypto';
import { applicationDefault, getApps, initializeApp } from 'firebase-admin/app';
import { getFirestore, Timestamp } from 'firebase-admin/firestore';
import { materializePersistedV3ToV4 } from '../functions/v4MigrationMaterializer.js';
import {
  migrateV3TripToV4,
  readPersistedV3MigrationSource,
  rollbackFreshV4Migration,
  v4MigrationDigest,
} from '../functions/v4MigrationStore.js';
import { purgeV4TripJob } from '../functions/v4TripPurgeStore.js';

export const PROJECT = 'atlasmap-dev';
export const CONFIRMATION = 'ADVANCE-ATLAS-V4-PILOT-DEV';

function requiredText(value, field, max = 160) {
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

export function parseArgs(args = []) {
  if (!Array.isArray(args)) throw new TypeError('args debe ser un arreglo.');
  const allowedFlags = new Set(['--apply']);
  const allowedPrefixes = ['--uid=', '--legacy-trip-id=', '--deleted-v4-trip-id=', '--confirm='];
  for (const value of args) {
    if (allowedFlags.has(value)) continue;
    if (allowedPrefixes.some((prefix) => value.startsWith(prefix))) continue;
    throw new TypeError(`Argumento desconocido: ${value}`);
  }

  const apply = args.includes('--apply');
  if (args.filter((value) => value === '--apply').length > 1) {
    throw new TypeError('--apply no puede repetirse.');
  }
  const uid = requiredText(argumentValue(args, '--uid'), '--uid', 128);
  const legacyTripId = requiredText(argumentValue(args, '--legacy-trip-id'), '--legacy-trip-id', 128);
  const deletedV4TripId = requiredText(
    argumentValue(args, '--deleted-v4-trip-id'),
    '--deleted-v4-trip-id',
    128
  );
  if (legacyTripId === deletedV4TripId) {
    throw new TypeError('Los viajes legacy y v4 eliminado deben ser distintos.');
  }
  const confirmation = argumentValue(args, '--confirm');
  if (!apply && confirmation) throw new TypeError('--confirm solo se usa junto con --apply.');
  if (apply && confirmation !== CONFIRMATION) {
    throw new TypeError(`--apply exige --confirm=${CONFIRMATION}.`);
  }
  return Object.freeze({ apply, uid, legacyTripId, deletedV4TripId, confirmation });
}

function adminDb() {
  const existing = getApps().find((app) => app.name === '[DEFAULT]');
  const app = existing || initializeApp({
    credential: applicationDefault(),
    projectId: PROJECT,
  });
  if (app.options?.projectId && app.options.projectId !== PROJECT) {
    throw new Error(`Firebase Admin apunta a ${app.options.projectId}, no a ${PROJECT}.`);
  }
  return getFirestore(app);
}

function millis(value) {
  return typeof value?.toMillis === 'function' ? value.toMillis() : null;
}

async function readDeletedV4Evidence(db, uid, tripId) {
  const tripRef = db.doc(`users/${uid}/trips/${tripId}`);
  const purgeRef = db.doc(`users/${uid}/__tripPurgeJobs/${tripId}`);
  const [tripSnapshot, purgeSnapshot] = await Promise.all([tripRef.get(), purgeRef.get()]);
  if (!tripSnapshot.exists) throw new Error('El viaje v4 eliminado de evidencia ya no existe.');
  if (!purgeSnapshot.exists) throw new Error('El viaje v4 eliminado ya no conserva su purge job.');
  const trip = tripSnapshot.data();
  const purge = purgeSnapshot.data();
  if (trip.schemaVersion !== 4 || trip.status !== 'deleted' || !Number.isInteger(trip.version)) {
    throw new Error('El viaje v4 de evidencia no está en estado deleted válido.');
  }
  if (purge.state !== 'scheduled' && purge.state !== 'claimed') {
    throw new Error('El purge job de evidencia no tiene estado válido.');
  }
  if (millis(trip.purgeAfter) === null || millis(trip.purgeAfter) !== millis(purge.dueAt)) {
    throw new Error('purgeAfter y dueAt del viaje v4 no coinciden.');
  }
  return Object.freeze({
    schemaVersion: trip.schemaVersion,
    status: trip.status,
    version: trip.version,
    purgeState: purge.state,
    deletedAtMs: millis(trip.deletedAt),
    purgeAfterMs: millis(trip.purgeAfter),
  });
}

async function readLegacyEvidence(db, uid, tripId) {
  const source = await readPersistedV3MigrationSource({ db, userId: uid, tripId });
  const materialized = materializePersistedV3ToV4(source);
  const expectedDigest = v4MigrationDigest(materialized);
  return { source, materialized, expectedDigest };
}

async function verifyMigratedV4(db, uid, tripId, expectedDigest) {
  const rootRef = db.doc(`users/${uid}/trips/${tripId}`);
  const checkpointRef = db.doc(`users/${uid}/__tripMigrations/${tripId}`);
  const [rootSnapshot, checkpointSnapshot] = await Promise.all([
    rootRef.get(),
    checkpointRef.get(),
  ]);
  if (!rootSnapshot.exists || !checkpointSnapshot.exists) {
    throw new Error('La verificación de migración no encontró root/checkpoint.');
  }
  const root = rootSnapshot.data();
  const checkpoint = checkpointSnapshot.data();
  if (root.schemaVersion !== 4 || root.version !== 1 || root.status !== 'active') {
    throw new Error('La migración no dejó el root en schemaVersion=4/active/version=1.');
  }
  if (checkpoint.state !== 'complete' || checkpoint.expectedDigest !== expectedDigest) {
    throw new Error('El checkpoint de migración no quedó complete con el digest esperado.');
  }
  return Object.freeze({
    schemaVersion: root.schemaVersion,
    status: root.status,
    version: root.version,
    checkpointState: checkpoint.state,
    digestMatches: true,
  });
}

async function verifyRolledBackLegacy(db, uid, tripId, sourceStorageVersion) {
  const rootSnapshot = await db.doc(`users/${uid}/trips/${tripId}`).get();
  const checkpointSnapshot = await db.doc(`users/${uid}/__tripMigrations/${tripId}`).get();
  if (!rootSnapshot.exists || !checkpointSnapshot.exists) {
    throw new Error('La verificación de rollback no encontró root/checkpoint.');
  }
  const root = rootSnapshot.data();
  const checkpoint = checkpointSnapshot.data();
  if (Number(root.storageVersion) !== Number(sourceStorageVersion) || root.schemaVersion === 4) {
    throw new Error('El rollback no devolvió el viaje a su storageVersion legacy.');
  }
  if (checkpoint.state !== 'rolled-back') {
    throw new Error('El checkpoint no quedó rolled-back.');
  }
  return Object.freeze({
    storageVersion: Number(root.storageVersion),
    checkpointState: checkpoint.state,
  });
}

async function runRealPurgeDrill(db, uid) {
  const now = Timestamp.now();
  const dueAt = Timestamp.fromMillis(now.toMillis() - 1_000);
  const tripId = `atlas-v4-purge-drill-${randomUUID()}`;
  const tripRef = db.doc(`users/${uid}/trips/${tripId}`);
  const childRef = tripRef.collection('notes').doc('purge-drill-note');
  const purgeRef = db.doc(`users/${uid}/__tripPurgeJobs/${tripId}`);

  await tripRef.set({
    id: tripId,
    name: 'ATLAS V4 PURGE DRILL',
    currency: 'USD',
    schemaVersion: 4,
    status: 'deleted',
    version: 2,
    createdAt: dueAt,
    updatedAt: dueAt,
    deletedAt: dueAt,
    purgeAfter: dueAt,
    segmentCount: 0,
    placeCount: 0,
    total: 0,
  });
  await childRef.set({
    id: childRef.id,
    rank: '0000000000',
    title: '',
    text: 'purge drill',
    status: 'deleted',
    version: 2,
    createdAt: dueAt,
    updatedAt: dueAt,
    deletedAt: dueAt,
  });
  await purgeRef.set({
    userId: uid,
    tripId,
    state: 'scheduled',
    dueAt,
    createdAt: dueAt,
    updatedAt: dueAt,
  });

  try {
    const result = await purgeV4TripJob({
      db,
      userId: uid,
      tripId,
      now: () => now,
    });
    const [rootAfter, childAfter, purgeAfter] = await Promise.all([
      tripRef.get(),
      childRef.get(),
      purgeRef.get(),
    ]);
    if (!result?.purged || rootAfter.exists || childAfter.exists || purgeAfter.exists) {
      throw new Error('El purge drill no eliminó completamente fixture, descendientes y job.');
    }
    return Object.freeze({
      purged: true,
      descendantsRemoved: true,
      purgeJobRemoved: true,
    });
  } catch (error) {
    await Promise.allSettled([
      db.recursiveDelete(tripRef),
      purgeRef.delete(),
    ]);
    throw error;
  }
}

export async function runPilotAdvanceDev({
  args = process.argv.slice(2),
  db = null,
  log = (value) => console.log(value),
} = {}) {
  const options = parseArgs(args);
  const firestore = db || adminDb();

  const [legacy, deletedV4] = await Promise.all([
    readLegacyEvidence(firestore, options.uid, options.legacyTripId),
    readDeletedV4Evidence(firestore, options.uid, options.deletedV4TripId),
  ]);

  const baseline = Object.freeze({
    project: PROJECT,
    mode: options.apply ? 'apply' : 'preflight',
    legacy: {
      storageVersion: Number(legacy.materialized.source.storageVersion),
      targetSchemaVersion: 4,
      expectedDigest: legacy.expectedDigest,
    },
    deletedV4,
    plannedApply: options.apply
      ? ['migrate-v3-to-v4', 'rollback-v4-to-v3', 'remigrate-v3-to-v4', 'isolated-real-purge-drill']
      : [],
    touchesProduction: false,
  });
  log(JSON.stringify(baseline, null, 2));

  if (!options.apply) {
    log('Preflight completo: no se modificó Firestore.');
    return baseline;
  }

  const firstMigration = await migrateV3TripToV4({
    db: firestore,
    userId: options.uid,
    tripId: options.legacyTripId,
  });
  if (firstMigration.state !== 'complete' || firstMigration.digest !== legacy.expectedDigest) {
    throw new Error('La primera migración no completó con el digest esperado.');
  }
  const firstMigrationVerified = await verifyMigratedV4(
    firestore,
    options.uid,
    options.legacyTripId,
    legacy.expectedDigest
  );

  const rollback = await rollbackFreshV4Migration({
    db: firestore,
    userId: options.uid,
    tripId: options.legacyTripId,
  });
  if (rollback.state !== 'rolled-back') {
    throw new Error('El rollback real no terminó en rolled-back.');
  }
  const rollbackVerified = await verifyRolledBackLegacy(
    firestore,
    options.uid,
    options.legacyTripId,
    legacy.materialized.source.storageVersion
  );

  const remigration = await migrateV3TripToV4({
    db: firestore,
    userId: options.uid,
    tripId: options.legacyTripId,
  });
  if (remigration.state !== 'complete' || remigration.digest !== legacy.expectedDigest) {
    throw new Error('La remigración no completó con el digest esperado.');
  }
  const remigrationVerified = await verifyMigratedV4(
    firestore,
    options.uid,
    options.legacyTripId,
    legacy.expectedDigest
  );

  const purgeDrill = await runRealPurgeDrill(firestore, options.uid);

  const result = Object.freeze({
    project: PROJECT,
    mode: 'complete',
    baselineComparison: {
      legacyStartedAsStorageVersion: Number(legacy.materialized.source.storageVersion),
      existingPilotTripSchemaVersion: deletedV4.schemaVersion,
      existingPilotTripStatus: deletedV4.status,
      existingPilotPurgeState: deletedV4.purgeState,
    },
    migration: {
      first: firstMigrationVerified,
      rollback: rollbackVerified,
      final: remigrationVerified,
      realRoundTripPassed: true,
    },
    purge: purgeDrill,
    finalLegacyTestTripState: 'v4-active',
    existingDeletedPilotTripMutated: false,
    productionMutated: false,
    pass: true,
  });
  log(JSON.stringify(result, null, 2));
  return result;
}

if (import.meta.url === new URL(`file://${process.argv[1]}`).href) {
  runPilotAdvanceDev().catch((error) => {
    console.error(error?.message || error);
    process.exitCode = 1;
  });
}
