import { createHash } from 'node:crypto';
import { FieldValue } from 'firebase-admin/firestore';
import { materializePersistedV3ToV4 } from './v4MigrationMaterializer.js';

const V3_COLLECTIONS = Object.freeze([
  'segments', 'places', 'routeConnections', 'notes', 'checklist',
]);
const V4_COLLECTIONS = Object.freeze([
  'segments', 'places', 'connections', 'notes', 'checklist',
]);

export class V4MigrationError extends Error {
  constructor(code, message) {
    super(message);
    this.name = 'V4MigrationError';
    this.code = code;
  }
}

function requiredText(value, field) {
  const text = typeof value === 'string' ? value.trim() : '';
  if (!text) throw new TypeError(`${field} es obligatorio.`);
  return text;
}

function tripRefs(db, userId, tripId) {
  const ownerId = requiredText(userId, 'userId');
  const safeTripId = requiredText(tripId, 'tripId');
  const userRef = db.doc(`users/${ownerId}`);
  return {
    ownerId,
    safeTripId,
    tripRef: userRef.collection('trips').doc(safeTripId),
    checkpointRef: userRef.collection('__tripMigrations').doc(safeTripId),
  };
}

function normalizeForDigest(value) {
  if (Array.isArray(value)) return value.map(normalizeForDigest);
  if (value && typeof value.toMillis === 'function') {
    return { __timestampMillis: value.toMillis() };
  }
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.keys(value).sort().map((key) => [key, normalizeForDigest(value[key])])
    );
  }
  return value;
}

function normalizedJson(value) {
  return JSON.stringify(normalizeForDigest(value));
}

export function v4MigrationDigest(materialized) {
  const canonical = normalizedJson({
    root: materialized.root,
    collections: materialized.collections,
    contributions: materialized.contributions,
  });
  return createHash('sha256').update(canonical).digest('hex');
}

async function readV3Collections(revisionRef) {
  const snapshots = await Promise.all(
    V3_COLLECTIONS.map((name) => revisionRef.collection(name).get())
  );
  return Object.fromEntries(snapshots.map((snapshot, index) => [
    V3_COLLECTIONS[index],
    snapshot.docs.map((item) => item.data()),
  ]));
}

export async function readPersistedV3MigrationSource({ db, userId, tripId } = {}) {
  if (!db) throw new TypeError('Se requiere Firestore Admin.');
  const { tripRef } = tripRefs(db, userId, tripId);
  const rootSnapshot = await tripRef.get();
  if (!rootSnapshot.exists) throw new V4MigrationError('not-found', 'El viaje v3 no existe.');
  const summary = rootSnapshot.data();
  if (Number(summary?.storageVersion) !== 3) {
    throw new V4MigrationError('not-v3', 'El viaje no está en storageVersion 3.');
  }
  const revisionId = requiredText(summary.activeRevision, 'activeRevision');
  const revisionRef = tripRef.collection('revisions').doc(revisionId);
  const [revisionSnapshot, collections] = await Promise.all([
    revisionRef.get(),
    readV3Collections(revisionRef),
  ]);
  if (!revisionSnapshot.exists) {
    throw new V4MigrationError('source-missing', 'La revisión v3 activa no existe.');
  }
  return {
    summary: { id: tripRef.id, ...summary },
    revision: { id: revisionSnapshot.id, ...revisionSnapshot.data() },
    collections,
  };
}

function checkpointMatchesSource(checkpoint, materialized) {
  return checkpoint?.sourceRevision === materialized.source.activeRevision
    && checkpoint?.sourceUpdatedAt === materialized.source.sourceUpdatedAt;
}

async function writeCollectionExactly(db, collectionRef, documents) {
  const desired = new Map(documents.map((item) => [item.id, item]));
  const existing = await collectionRef.get();
  const writer = db.bulkWriter();
  for (const document of existing.docs) {
    if (!desired.has(document.id)) writer.delete(document.ref);
  }
  for (const [id, data] of desired) writer.set(collectionRef.doc(id), data);
  await writer.close();
}

async function writeContributionsExactly(db, tripRef, contributions) {
  const collectionRef = tripRef.collection('__aggregateContributions');
  const desired = new Map(contributions.map((item) => [item.id, item]));
  const existing = await collectionRef.get();
  const writer = db.bulkWriter();
  for (const document of existing.docs) {
    if (!desired.has(document.id)) writer.delete(document.ref);
  }
  for (const [id, raw] of desired) {
    const { id: ignoredId, ...data } = raw;
    void ignoredId;
    writer.set(collectionRef.doc(id), data);
  }
  await writer.close();
}

async function readStagedV4(tripRef) {
  const snapshots = await Promise.all(
    V4_COLLECTIONS.map((name) => tripRef.collection(name).get())
  );
  const collections = Object.fromEntries(snapshots.map((snapshot, index) => [
    V4_COLLECTIONS[index],
    snapshot.docs
      .map((item) => ({ id: item.id, ...item.data() }))
      .sort((left, right) => String(left.rank).localeCompare(String(right.rank))),
  ]));
  const contributionSnapshot = await tripRef.collection('__aggregateContributions').get();
  const contributions = contributionSnapshot.docs
    .map((item) => ({ id: item.id, ...item.data() }))
    .sort((left, right) => left.id.localeCompare(right.id));
  return { collections, contributions };
}

function stagedDigest(root, staged) {
  return v4MigrationDigest({ root, ...staged });
}

async function completedMigrationReplay({ db, userId, tripId } = {}) {
  if (!db) throw new TypeError('Se requiere Firestore Admin.');
  const { tripRef, checkpointRef } = tripRefs(db, userId, tripId);
  const [rootSnapshot, checkpointSnapshot] = await Promise.all([
    tripRef.get(),
    checkpointRef.get(),
  ]);
  if (!rootSnapshot.exists || !checkpointSnapshot.exists) return null;
  const root = rootSnapshot.data();
  const checkpoint = checkpointSnapshot.data();
  if (root.schemaVersion !== 4 || checkpoint.state !== 'complete') return null;
  return {
    state: 'complete',
    idempotentReplay: true,
    version: root.version,
    digest: checkpoint.expectedDigest,
  };
}

export async function stageV3TripMigration({ db, userId, tripId } = {}) {
  if (!db) throw new TypeError('Se requiere Firestore Admin.');
  const { ownerId, safeTripId, tripRef, checkpointRef } = tripRefs(db, userId, tripId);
  const source = await readPersistedV3MigrationSource({ db, userId: ownerId, tripId: safeTripId });
  const materialized = materializePersistedV3ToV4(source);
  const digest = v4MigrationDigest(materialized);

  await db.runTransaction(async (transaction) => {
    const rootSnapshot = await transaction.get(tripRef);
    if (!rootSnapshot.exists) throw new V4MigrationError('source-changed', 'El viaje desapareció durante la migración.');
    const current = rootSnapshot.data();
    if (
      Number(current.storageVersion) !== 3
      || current.activeRevision !== materialized.source.activeRevision
      || current.updatedAt !== materialized.source.sourceUpdatedAt
    ) {
      throw new V4MigrationError('source-changed', 'El viaje v3 cambió durante la preparación de la migración.');
    }
    transaction.set(checkpointRef, {
      userId: ownerId,
      tripId: safeTripId,
      state: 'staging',
      sourceStorageVersion: 3,
      sourceRevision: materialized.source.activeRevision,
      sourceUpdatedAt: materialized.source.sourceUpdatedAt,
      sourceSummary: current,
      expectedDigest: digest,
      startedAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
      verifiedAt: null,
      completedAt: null,
    });
  });

  for (const name of V4_COLLECTIONS) {
    await writeCollectionExactly(db, tripRef.collection(name), materialized.collections[name]);
  }
  await writeContributionsExactly(db, tripRef, materialized.contributions);

  const staged = await readStagedV4(tripRef);
  const actualDigest = stagedDigest(materialized.root, staged);
  if (actualDigest !== digest) {
    throw new V4MigrationError('verification-failed', 'El staging v4 no coincide con el materializado esperado.');
  }

  await db.runTransaction(async (transaction) => {
    const [rootSnapshot, checkpointSnapshot] = await Promise.all([
      transaction.get(tripRef),
      transaction.get(checkpointRef),
    ]);
    if (!rootSnapshot.exists || !checkpointSnapshot.exists) {
      throw new V4MigrationError('source-changed', 'La migración perdió su root o checkpoint.');
    }
    const current = rootSnapshot.data();
    const checkpoint = checkpointSnapshot.data();
    if (!checkpointMatchesSource(checkpoint, materialized)
      || checkpoint.expectedDigest !== digest
      || Number(current.storageVersion) !== 3
      || current.activeRevision !== materialized.source.activeRevision
      || current.updatedAt !== materialized.source.sourceUpdatedAt) {
      throw new V4MigrationError('source-changed', 'El viaje v3 cambió antes de verificar staging.');
    }
    transaction.update(checkpointRef, {
      state: 'verified',
      verifiedAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
    });
  });

  return { materialized, digest, state: 'verified' };
}

export async function finalizeV3TripMigration({ db, userId, tripId, materialized, digest } = {}) {
  if (!db) throw new TypeError('Se requiere Firestore Admin.');
  if (!materialized || !digest) throw new TypeError('materialized y digest son obligatorios.');
  const { tripRef, checkpointRef } = tripRefs(db, userId, tripId);

  return db.runTransaction(async (transaction) => {
    const [rootSnapshot, checkpointSnapshot] = await Promise.all([
      transaction.get(tripRef),
      transaction.get(checkpointRef),
    ]);
    if (!rootSnapshot.exists || !checkpointSnapshot.exists) {
      throw new V4MigrationError('not-ready', 'La migración no tiene root/checkpoint verificable.');
    }
    const root = rootSnapshot.data();
    const checkpoint = checkpointSnapshot.data();
    if (checkpoint.state === 'complete' && root.schemaVersion === 4) {
      if (checkpoint.expectedDigest !== digest || !checkpointMatchesSource(checkpoint, materialized)) {
        throw new V4MigrationError('replay-mismatch', 'El replay de migración no coincide con la migración completada.');
      }
      return { state: 'complete', idempotentReplay: true, version: root.version };
    }
    if (checkpoint.state !== 'verified'
      || checkpoint.expectedDigest !== digest
      || !checkpointMatchesSource(checkpoint, materialized)) {
      throw new V4MigrationError('not-ready', 'La migración todavía no está verificada para commit.');
    }
    if (Number(root.storageVersion) !== 3
      || root.activeRevision !== materialized.source.activeRevision
      || root.updatedAt !== materialized.source.sourceUpdatedAt) {
      throw new V4MigrationError('source-changed', 'El viaje v3 cambió antes del commit final.');
    }

    transaction.set(tripRef, materialized.root);
    transaction.update(checkpointRef, {
      state: 'complete',
      completedAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
      targetVersion: 1,
    });
    return { state: 'complete', idempotentReplay: false, version: 1 };
  });
}

export async function migrateV3TripToV4(input = {}) {
  const completed = await completedMigrationReplay(input);
  if (completed) return completed;
  const staged = await stageV3TripMigration(input);
  const finalized = await finalizeV3TripMigration({
    ...input,
    materialized: staged.materialized,
    digest: staged.digest,
  });
  return { ...finalized, digest: staged.digest };
}

export async function rollbackFreshV4Migration({ db, userId, tripId } = {}) {
  if (!db) throw new TypeError('Se requiere Firestore Admin.');
  const { tripRef, checkpointRef } = tripRefs(db, userId, tripId);
  const [rootSnapshot, checkpointSnapshot, staged] = await Promise.all([
    tripRef.get(),
    checkpointRef.get(),
    readStagedV4(tripRef),
  ]);
  if (!rootSnapshot.exists || !checkpointSnapshot.exists) {
    throw new V4MigrationError('rollback-unavailable', 'No existe migración completa para rollback.');
  }
  const preflightRoot = rootSnapshot.data();
  const checkpoint = checkpointSnapshot.data();
  if (checkpoint.state !== 'complete' || preflightRoot.schemaVersion !== 4 || preflightRoot.version !== 1) {
    throw new V4MigrationError('rollback-unsafe', 'El viaje ya no está en el estado fresco de migración.');
  }
  const currentDigest = stagedDigest(preflightRoot, staged);
  if (currentDigest !== checkpoint.expectedDigest) {
    throw new V4MigrationError('rollback-unsafe', 'El estado v4 cambió después de la migración.');
  }
  const preflightRootJson = normalizedJson(preflightRoot);

  return db.runTransaction(async (transaction) => {
    const [currentRootSnapshot, currentCheckpointSnapshot] = await Promise.all([
      transaction.get(tripRef),
      transaction.get(checkpointRef),
    ]);
    if (!currentRootSnapshot.exists || !currentCheckpointSnapshot.exists) {
      throw new V4MigrationError('rollback-unavailable', 'La migración dejó de estar disponible para rollback.');
    }
    const currentRoot = currentRootSnapshot.data();
    const currentCheckpoint = currentCheckpointSnapshot.data();
    if (
      currentCheckpoint.state !== 'complete'
      || currentCheckpoint.expectedDigest !== checkpoint.expectedDigest
      || currentRoot.schemaVersion !== 4
      || currentRoot.version !== 1
      || normalizedJson(currentRoot) !== preflightRootJson
    ) {
      throw new V4MigrationError('rollback-unsafe', 'El estado v4 cambió durante el preflight de rollback.');
    }
    transaction.set(tripRef, currentCheckpoint.sourceSummary);
    transaction.update(checkpointRef, {
      state: 'rolled-back',
      rolledBackAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
    });
    return { state: 'rolled-back' };
  });
}
