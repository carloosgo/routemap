import { FieldValue } from 'firebase-admin/firestore';
import {
  aggregateDeltaFromContribution,
  targetAggregateContribution,
} from './v4AggregateContributionModel.js';
import {
  v4OriginAggregateValue,
  v4SegmentAggregateValue,
} from './v4SegmentAggregateValue.js';

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
  return null;
}

function aggregateValueFor(entityType) {
  if (entityType === 'segment') return v4SegmentAggregateValue;
  if (entityType === 'origin') return v4OriginAggregateValue;
  return () => 0;
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
    valueOf: aggregateValueFor(entityType),
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

    const tripPatch = {};
    const targetCountField = countField(entityType);
    if (targetCountField) {
      tripPatch[targetCountField] = FieldValue.increment(delta.countDelta);
    }
    if (entityType === 'segment' || entityType === 'origin') {
      if (delta.valueDelta !== 0) {
        tripPatch.total = FieldValue.increment(delta.valueDelta);
      }
    }
    if (Object.keys(tripPatch).length > 0) {
      tripPatch.updatedAt = FieldValue.serverTimestamp();
      transaction.update(tripRef, tripPatch);
    }
    return { applied: true, ...delta, targetVersion: target.version };
  });
}
