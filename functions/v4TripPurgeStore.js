import { Timestamp } from 'firebase-admin/firestore';

export class V4TripPurgeError extends Error {
  constructor(code, message) {
    super(message);
    this.name = 'V4TripPurgeError';
    this.code = code;
  }
}

function requiredText(value, field) {
  const normalized = typeof value === 'string' ? value.trim() : '';
  if (!normalized) throw new TypeError(`${field} es obligatorio.`);
  return normalized;
}

function timestampValue(value, field) {
  if (value instanceof Timestamp) return value;
  if (value instanceof Date && Number.isFinite(value.getTime())) {
    return Timestamp.fromDate(value);
  }
  throw new TypeError(`${field} debe ser Timestamp o Date válido.`);
}

function positiveLimit(value) {
  if (!Number.isInteger(value) || value < 1 || value > 100) {
    throw new TypeError('limit debe ser un entero entre 1 y 100.');
  }
  return value;
}

function dueMillis(value) {
  return typeof value?.toMillis === 'function' ? value.toMillis() : null;
}

function purgeRefs(db, userId, tripId) {
  const ownerId = requiredText(userId, 'userId');
  const safeTripId = requiredText(tripId, 'tripId');
  const userRef = db.doc(`users/${ownerId}`);
  return {
    ownerId,
    safeTripId,
    tripRef: userRef.collection('trips').doc(safeTripId),
    jobRef: userRef.collection('__tripPurgeJobs').doc(safeTripId),
  };
}

function identityFromJobRef(jobRef) {
  const parts = String(jobRef?.path || '').split('/');
  if (parts.length !== 4 || parts[0] !== 'users' || parts[2] !== '__tripPurgeJobs') {
    throw new V4TripPurgeError('invalid-job-path', 'Ruta de job de purga v4 inválida.');
  }
  return { userId: parts[1], tripId: parts[3] };
}

function assertJobIdentity(job, userId, tripId) {
  if (job?.userId !== userId || job?.tripId !== tripId) {
    throw new V4TripPurgeError(
      'invalid-job-identity',
      'El job de purga no coincide con su ruta autoritativa.'
    );
  }
}

export async function purgeV4TripJob({
  db,
  userId,
  tripId,
  now = () => Timestamp.now(),
  recursiveDelete,
} = {}) {
  if (!db) throw new TypeError('Se requiere Firestore Admin.');
  const deleteTree = recursiveDelete || ((ref) => db.recursiveDelete(ref));
  if (typeof deleteTree !== 'function') throw new TypeError('recursiveDelete debe ser función.');
  if (typeof now !== 'function') throw new TypeError('now debe ser función.');

  const timestamp = timestampValue(now(), 'now()');
  const { ownerId, safeTripId, tripRef, jobRef } = purgeRefs(db, userId, tripId);

  const claim = await db.runTransaction(async (transaction) => {
    const [jobSnapshot, tripSnapshot] = await Promise.all([
      transaction.get(jobRef),
      transaction.get(tripRef),
    ]);
    if (!jobSnapshot.exists) return { action: 'missing-job' };

    const job = jobSnapshot.data();
    assertJobIdentity(job, ownerId, safeTripId);
    const jobDueAt = dueMillis(job?.dueAt);
    if (jobDueAt === null) {
      throw new V4TripPurgeError('invalid-job', 'El job de purga no tiene dueAt válido.');
    }
    if (jobDueAt > timestamp.toMillis()) return { action: 'not-due' };

    if (!tripSnapshot.exists) {
      transaction.set(jobRef, {
        ...job,
        state: 'claimed',
        claimedAt: job.claimedAt || timestamp,
        updatedAt: timestamp,
      });
      return { action: 'cleanup', rootAlreadyMissing: true };
    }

    const trip = tripSnapshot.data();
    const tripDueAt = dueMillis(trip?.purgeAfter);
    if (
      trip.schemaVersion !== 4
      || trip.status !== 'deleted'
      || tripDueAt === null
      || tripDueAt !== jobDueAt
      || tripDueAt > timestamp.toMillis()
    ) {
      return { action: 'stale-job' };
    }

    transaction.set(jobRef, {
      ...job,
      state: 'claimed',
      claimedAt: timestamp,
      updatedAt: timestamp,
    });
    transaction.delete(tripRef);
    return { action: 'cleanup', rootAlreadyMissing: false };
  });

  if (claim.action !== 'cleanup') {
    return {
      userId: ownerId,
      tripId: safeTripId,
      purged: false,
      reason: claim.action,
    };
  }

  await deleteTree(tripRef);
  await jobRef.delete();
  return {
    userId: ownerId,
    tripId: safeTripId,
    purged: true,
    resumed: Boolean(claim.rootAlreadyMissing),
  };
}

export async function runDueV4TripPurges({
  db,
  now = () => Timestamp.now(),
  limit = 25,
  recursiveDelete,
} = {}) {
  if (!db) throw new TypeError('Se requiere Firestore Admin.');
  if (typeof now !== 'function') throw new TypeError('now debe ser función.');
  const timestamp = timestampValue(now(), 'now()');
  const maxJobs = positiveLimit(limit);
  const snapshot = await db.collectionGroup('__tripPurgeJobs')
    .where('dueAt', '<=', timestamp)
    .orderBy('dueAt', 'asc')
    .limit(maxJobs)
    .get();

  const summary = {
    scanned: snapshot.size,
    purged: 0,
    skipped: 0,
    failed: 0,
    failures: [],
  };

  for (const jobSnapshot of snapshot.docs) {
    try {
      const identity = identityFromJobRef(jobSnapshot.ref);
      const result = await purgeV4TripJob({
        db,
        ...identity,
        now: () => timestamp,
        recursiveDelete,
      });
      if (result.purged) summary.purged += 1;
      else summary.skipped += 1;
    } catch (error) {
      summary.failed += 1;
      summary.failures.push({
        jobPath: jobSnapshot.ref.path,
        errorName: error?.name || 'Error',
        errorCode: error?.code || '',
      });
    }
  }

  return summary;
}
