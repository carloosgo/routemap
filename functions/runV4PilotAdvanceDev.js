/* global process */
import { randomUUID } from 'node:crypto';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { applicationDefault, getApps, initializeApp } from 'firebase-admin/app';
import { getFirestore, Timestamp } from 'firebase-admin/firestore';
import { materializePersistedV3ToV4 } from './v4MigrationMaterializer.js';
import {
  migrateV3TripToV4,
  readPersistedV3MigrationSource,
  rollbackFreshV4Migration,
  v4MigrationDigest,
} from './v4MigrationStore.js';
import { purgeV4TripJob } from './v4TripPurgeStore.js';

export const PROJECT = 'atlasmap-dev';
export const CONFIRMATION = 'ADVANCE-ATLAS-V4-PILOT-DEV';

function requiredText(value, field, max = 160) {
  const normalized = typeof value === 'string' ? value.trim() : '';
  if (!normalized || normalized.length > max) throw new TypeError(`${field} es obligatorio.`);
  return normalized;
}

function argumentValue(args, name) {
  const prefix = `${name}=`;
  const matches = args.filter((value) => value.startsWith(prefix));
  if (matches.length > 1) throw new TypeError(`${name} no puede repetirse.`);
  return matches.length === 1 ? matches[0].slice(prefix.length).trim() : '';
}

export function parseArgs(args = []) {
  const allowedFlags = new Set(['--apply']);
  const allowedPrefixes = ['--uid=', '--legacy-trip-id=', '--deleted-v4-trip-id=', '--confirm='];
  for (const value of args) {
    if (allowedFlags.has(value) || allowedPrefixes.some((prefix) => value.startsWith(prefix))) continue;
    throw new TypeError(`Argumento desconocido: ${value}`);
  }
  const apply = args.includes('--apply');
  const uid = requiredText(argumentValue(args, '--uid'), '--uid', 128);
  const legacyTripId = requiredText(argumentValue(args, '--legacy-trip-id'), '--legacy-trip-id', 128);
  const deletedV4TripId = requiredText(argumentValue(args, '--deleted-v4-trip-id'), '--deleted-v4-trip-id', 128);
  if (legacyTripId === deletedV4TripId) throw new TypeError('Los viajes de evidencia deben ser distintos.');
  const confirmation = argumentValue(args, '--confirm');
  if (!apply && confirmation) throw new TypeError('--confirm solo se usa con --apply.');
  if (apply && confirmation !== CONFIRMATION) {
    throw new TypeError(`--apply exige --confirm=${CONFIRMATION}.`);
  }
  return Object.freeze({ apply, uid, legacyTripId, deletedV4TripId });
}

function adminDb() {
  const existing = getApps().find((app) => app.name === '[DEFAULT]');
  const app = existing || initializeApp({ credential: applicationDefault(), projectId: PROJECT });
  if (app.options?.projectId && app.options.projectId !== PROJECT) {
    throw new Error(`Firebase Admin apunta a ${app.options.projectId}, no a ${PROJECT}.`);
  }
  return getFirestore(app);
}

const millis = (value) => typeof value?.toMillis === 'function' ? value.toMillis() : null;

async function readDeletedV4Evidence(db, uid, tripId) {
  const tripRef = db.doc(`users/${uid}/trips/${tripId}`);
  const purgeRef = db.doc(`users/${uid}/__tripPurgeJobs/${tripId}`);
  const [tripSnapshot, purgeSnapshot] = await Promise.all([tripRef.get(), purgeRef.get()]);
  if (!tripSnapshot.exists || !purgeSnapshot.exists) throw new Error('Falta evidencia delete/purge v4 esperada.');
  const trip = tripSnapshot.data();
  const purge = purgeSnapshot.data();
  if (trip.schemaVersion !== 4 || trip.status !== 'deleted' || trip.version < 2) {
    throw new Error('El viaje v4 de evidencia no está deleted/version>=2.');
  }
  if (!['scheduled', 'claimed'].includes(purge.state)) throw new Error('El purge job de evidencia no es válido.');
  if (millis(trip.purgeAfter) === null || millis(trip.purgeAfter) !== millis(purge.dueAt)) {
    throw new Error('purgeAfter y dueAt no coinciden.');
  }
  return {
    schemaVersion: trip.schemaVersion,
    status: trip.status,
    version: trip.version,
    purgeState: purge.state,
  };
}

async function readLegacyEvidence(db, uid, tripId) {
  const source = await readPersistedV3MigrationSource({ db, userId: uid, tripId });
  const materialized = materializePersistedV3ToV4(source);
  return { materialized, expectedDigest: v4MigrationDigest(materialized) };
}

async function verifyMigrated(db, uid, tripId, expectedDigest) {
  const [rootSnapshot, checkpointSnapshot] = await Promise.all([
    db.doc(`users/${uid}/trips/${tripId}`).get(),
    db.doc(`users/${uid}/__tripMigrations/${tripId}`).get(),
  ]);
  const root = rootSnapshot.data();
  const checkpoint = checkpointSnapshot.data();
  if (!rootSnapshot.exists || !checkpointSnapshot.exists
    || root?.schemaVersion !== 4 || root?.status !== 'active' || root?.version !== 1
    || checkpoint?.state !== 'complete' || checkpoint?.expectedDigest !== expectedDigest) {
    throw new Error('La verificación v4 posterior a migración falló.');
  }
  return { schemaVersion: 4, status: 'active', version: 1, checkpointState: 'complete' };
}

async function verifyRollback(db, uid, tripId, sourceStorageVersion) {
  const [rootSnapshot, checkpointSnapshot] = await Promise.all([
    db.doc(`users/${uid}/trips/${tripId}`).get(),
    db.doc(`users/${uid}/__tripMigrations/${tripId}`).get(),
  ]);
  const root = rootSnapshot.data();
  const checkpoint = checkpointSnapshot.data();
  if (!rootSnapshot.exists || !checkpointSnapshot.exists
    || Number(root?.storageVersion) !== Number(sourceStorageVersion)
    || root?.schemaVersion === 4 || checkpoint?.state !== 'rolled-back') {
    throw new Error('La verificación real de rollback falló.');
  }
  return { storageVersion: Number(root.storageVersion), checkpointState: 'rolled-back' };
}

async function runRealPurgeDrill(db, uid) {
  const now = Timestamp.now();
  const dueAt = Timestamp.fromMillis(now.toMillis() - 1000);
  const tripId = `atlas-v4-purge-drill-${randomUUID()}`;
  const tripRef = db.doc(`users/${uid}/trips/${tripId}`);
  const childRef = tripRef.collection('notes').doc('purge-drill-note');
  const purgeRef = db.doc(`users/${uid}/__tripPurgeJobs/${tripId}`);
  await tripRef.set({
    id: tripId, name: 'ATLAS V4 PURGE DRILL', currency: 'USD', schemaVersion: 4,
    status: 'deleted', version: 2, createdAt: dueAt, updatedAt: dueAt,
    deletedAt: dueAt, purgeAfter: dueAt, segmentCount: 0, placeCount: 0, total: 0,
  });
  await childRef.set({
    id: childRef.id, rank: '0000000000', title: '', text: 'purge drill',
    status: 'deleted', version: 2, createdAt: dueAt, updatedAt: dueAt, deletedAt: dueAt,
  });
  await purgeRef.set({ userId: uid, tripId, state: 'scheduled', dueAt, createdAt: dueAt, updatedAt: dueAt });

  try {
    const result = await purgeV4TripJob({ db, userId: uid, tripId, now: () => now });
    const [rootAfter, childAfter, purgeAfter] = await Promise.all([
      tripRef.get(), childRef.get(), purgeRef.get(),
    ]);
    if (!result?.purged || rootAfter.exists || childAfter.exists || purgeAfter.exists) {
      throw new Error('El purge drill no eliminó completamente el fixture.');
    }
    return { purged: true, descendantsRemoved: true, purgeJobRemoved: true };
  } catch (error) {
    await Promise.allSettled([db.recursiveDelete(tripRef), purgeRef.delete()]);
    throw error;
  }
}

export async function runV4PilotAdvanceDev({ args = process.argv.slice(2), db = null } = {}) {
  const options = parseArgs(args);
  const firestore = db || adminDb();
  const [legacy, deletedV4] = await Promise.all([
    readLegacyEvidence(firestore, options.uid, options.legacyTripId),
    readDeletedV4Evidence(firestore, options.uid, options.deletedV4TripId),
  ]);
  const sourceStorageVersion = Number(legacy.materialized.source.storageVersion);

  console.log(JSON.stringify({
    project: PROJECT,
    mode: options.apply ? 'apply' : 'preflight',
    baseline: { legacyStorageVersion: sourceStorageVersion, deletedV4 },
    plannedApply: options.apply
      ? ['migrate', 'rollback', 'remigrate', 'isolated-real-purge-drill']
      : [],
    touchesProduction: false,
  }, null, 2));

  if (!options.apply) return;

  const first = await migrateV3TripToV4({ db: firestore, userId: options.uid, tripId: options.legacyTripId });
  if (first.state !== 'complete' || first.digest !== legacy.expectedDigest) throw new Error('Primera migración inválida.');
  const firstVerified = await verifyMigrated(firestore, options.uid, options.legacyTripId, legacy.expectedDigest);

  const rollback = await rollbackFreshV4Migration({ db: firestore, userId: options.uid, tripId: options.legacyTripId });
  if (rollback.state !== 'rolled-back') throw new Error('Rollback real inválido.');
  const rollbackVerified = await verifyRollback(firestore, options.uid, options.legacyTripId, sourceStorageVersion);

  const remigration = await migrateV3TripToV4({ db: firestore, userId: options.uid, tripId: options.legacyTripId });
  if (remigration.state !== 'complete' || remigration.digest !== legacy.expectedDigest) throw new Error('Remigración inválida.');
  const finalVerified = await verifyMigrated(firestore, options.uid, options.legacyTripId, legacy.expectedDigest);

  const purge = await runRealPurgeDrill(firestore, options.uid);

  console.log(JSON.stringify({
    project: PROJECT,
    pass: true,
    migration: { first: firstVerified, rollback: rollbackVerified, final: finalVerified, realRoundTripPassed: true },
    purge,
    existingDeletedPilotTripMutated: false,
    finalLegacyTestTripState: 'v4-active',
    productionMutated: false,
  }, null, 2));
}

const invokedPath = process.argv[1] ? resolve(process.argv[1]) : '';
const modulePath = resolve(fileURLToPath(import.meta.url));
if (invokedPath === modulePath) {
  runV4PilotAdvanceDev().catch((error) => {
    console.error(error?.message || error);
    process.exitCode = 1;
  });
}
