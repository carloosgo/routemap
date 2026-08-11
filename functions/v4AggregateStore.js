import { FieldValue } from 'firebase-admin/firestore';
import {
  aggregateDeltaFromContribution,
  targetAggregateContribution,
} from './v4AggregateContributionModel.js';
import { v4SegmentAggregateValue } from './v4SegmentAggregateValue.js';

function requiredText(value, field) {
  const normalized = typeof value === 'string' ? value.trim() : '';
  if (!normalized) throw new TypeError(`${field} es obligatorio.`);
  return normalized;
}

function assertEntityIdentity(entity, entityId, label) {
  if (!entity) return;
  const payloadId = requiredText(entity.id, `${label}.id`);
  if (payloadId !== entityId) {
    throw new TypeError(`${label}.id no coincide con la ruta del evento.`);
  }
}

function countField(entityType) {
  if (entityType === 'segment') return 'segmentCount';
  if (entityType === 'place') return 'placeCount';
  throw new TypeError('La entidad no participa en agregados v4.');
}

export async function applyV4AggregateEvent({
  db,
  userId,
  tripId,
  entityId,
  entityType,
  before = null,
  after = null,
}) {
  if (!db) throw new TypeError('Se requiere Firestore Admin.');
  const ownerId = requiredText(userId, 'userId');
  const safeTripId = requiredText(tripId, 'tripId');
  const safeEntityId = requiredText(entityId, 'entityId');
  assertEntityIdentity(before, safeEntityId, 'before');
  assertEntityIdentity(after, safeEntityId, 'after');

  const target = targetAggregateContribution({
    entityType,
    before,
    after,
    valueOf: entityType === 'segment' ? v4SegmentAggregateValue : () => 0,
  });
  const tripRef = db.doc(`users/${ownerId}/trips/${safeTripId}`);
  const contributionId = `${entityType}:${encodeURIComponent(safeEntityId)}`;
  const contributionRef = tripRef.collection('__aggregateContributions').doc(contributionId);

  return db.runTransaction(async (transaction) => {
    const [tripSnapshot, contributionSnapshot] = await Promise.all([
      transaction.get(tripRef),
      transaction.get(contributionRef),
    ]);

    if (!tripSnapshot.exists || tripSnapshot.data()?.schemaVersion !== 4) {
      return {
        applied: false,
        skipped: true,
        reason: 'trip-not-v4',
        targetVersion: target.version,
      };
    }

    const current = contributionSnapshot.exists ? contributionSnapshot.data() : null;
    const delta = aggregateDeltaFromContribution(current, target);
    if (!delta.apply) return { applied: false, ...delta };

    transaction.set(contributionRef, {
      ...target,
      entityId: safeEntityId,
      updatedAt: FieldValue.serverTimestamp(),
    });

    const tripPatch = {
      [countField(entityType)]: FieldValue.increment(delta.countDelta),
      updatedAt: FieldValue.serverTimestamp(),
    };
    if (entityType === 'segment') {
      tripPatch.total = FieldValue.increment(delta.valueDelta);
    }
    transaction.update(tripRef, tripPatch);
    return { applied: true, ...delta, targetVersion: target.version };
  });
}
