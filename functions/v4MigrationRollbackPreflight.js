import { v4MigrationDigest, V4MigrationError } from './v4MigrationStore.js';

const V4_COLLECTIONS = Object.freeze([
  'segments', 'places', 'connections', 'notes', 'checklist',
]);
const SUPPORTED_SOURCE_VERSIONS = new Set([2, 3]);

function requiredText(value, field) {
  const normalized = typeof value === 'string' ? value.trim() : '';
  if (!normalized) throw new TypeError(`${field} es obligatorio.`);
  return normalized;
}

async function readCurrentV4(tripRef) {
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

export async function readFreshV4MigrationRollbackPreflight({ db, userId, tripId } = {}) {
  if (!db) throw new TypeError('Se requiere Firestore Admin.');
  const ownerId = requiredText(userId, 'userId');
  const safeTripId = requiredText(tripId, 'tripId');
  const userRef = db.doc(`users/${ownerId}`);
  const tripRef = userRef.collection('trips').doc(safeTripId);
  const checkpointRef = userRef.collection('__tripMigrations').doc(safeTripId);
  const [rootSnapshot, checkpointSnapshot] = await Promise.all([
    tripRef.get(),
    checkpointRef.get(),
  ]);

  if (!rootSnapshot.exists || !checkpointSnapshot.exists) {
    throw new V4MigrationError(
      'rollback-unavailable',
      'No existe una migración v4 completa disponible para rollback.'
    );
  }

  const root = rootSnapshot.data();
  const checkpoint = checkpointSnapshot.data();
  const sourceStorageVersion = Number(checkpoint?.sourceStorageVersion);
  if (!SUPPORTED_SOURCE_VERSIONS.has(sourceStorageVersion)) {
    throw new V4MigrationError('rollback-unsafe', 'El checkpoint no conserva una versión legacy soportada.');
  }
  if (checkpoint?.state !== 'complete' || root?.schemaVersion !== 4 || root?.version !== 1) {
    throw new V4MigrationError(
      'rollback-unsafe',
      'El viaje ya no está en el estado fresco requerido para rollback.'
    );
  }
  if (typeof checkpoint?.expectedDigest !== 'string' || !/^[a-f0-9]{64}$/.test(checkpoint.expectedDigest)) {
    throw new V4MigrationError('rollback-unsafe', 'El checkpoint no contiene un digest válido.');
  }

  const staged = await readCurrentV4(tripRef);
  const currentDigest = v4MigrationDigest({ root, ...staged });
  if (currentDigest !== checkpoint.expectedDigest) {
    throw new V4MigrationError(
      'rollback-unsafe',
      'El estado v4 cambió después de la migración y ya no admite rollback fresco.'
    );
  }

  return Object.freeze({
    sourceStorageVersion,
    targetSchemaVersion: 4,
    targetVersion: root.version,
    checkpointState: checkpoint.state,
    expectedDigest: checkpoint.expectedDigest,
    entityCounts: Object.fromEntries(
      Object.entries(staged.collections).map(([name, items]) => [name, items.length])
    ),
    aggregateContributionCount: staged.contributions.length,
    rollbackEligible: true,
  });
}
