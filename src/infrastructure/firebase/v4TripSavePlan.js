import { normalizeTrip } from '../../modules/trips/tripModel.js';
import { initialRankForPosition } from '../../modules/storage-v4/rankModel.js';
import { V4_ENTITY_STATUS } from '../../modules/storage-v4/storageV4Contract.js';
import { v4EntityPayload } from './v4EntityDocuments.js';

export const V4_TRIP_SAVE_COLLECTIONS = Object.freeze([
  Object.freeze({ tripField: 'segments', entityType: 'segment' }),
  Object.freeze({ tripField: 'places', entityType: 'place' }),
  Object.freeze({ tripField: 'routeConnections', entityType: 'connection' }),
  Object.freeze({ tripField: 'notes', entityType: 'note' }),
  Object.freeze({ tripField: 'checklist', entityType: 'checklist' }),
]);

function requiredText(value, field) {
  const normalized = typeof value === 'string' ? value.trim() : '';
  if (!normalized) throw new TypeError(`${field} es obligatorio.`);
  return normalized;
}

function remoteVersion(value, field) {
  const version = Number(value);
  if (!Number.isInteger(version) || version < 1) {
    throw new TypeError(`${field}.version inválida.`);
  }
  return version;
}

function remoteStatus(value, field) {
  if (value !== V4_ENTITY_STATUS.ACTIVE && value !== V4_ENTITY_STATUS.DELETED) {
    throw new TypeError(`${field}.status inválido.`);
  }
  return value;
}

function samePayload(left, right) {
  return JSON.stringify(left) === JSON.stringify(right);
}

function assertUniqueIds(items, label) {
  const seen = new Set();
  for (const item of items) {
    const id = requiredText(item?.id, `${label}.id`);
    if (seen.has(id)) throw new TypeError(`${label} contiene id duplicado: ${id}.`);
    seen.add(id);
  }
}

function normalizeTripForV4Plan(rawTrip) {
  const trip = normalizeTrip(rawTrip);
  // normalizeTrip keeps the legacy UI invariant of creating a starter note when
  // notes are absent. Storage v4 must nevertheless preserve an explicitly empty
  // canonical notes collection; otherwise every plan fabricates a fresh note id.
  if (Array.isArray(rawTrip?.notes) && rawTrip.notes.length === 0) trip.notes = [];
  return trip;
}

function rootPayload(trip) {
  return {
    id: trip.id,
    name: trip.name,
    currency: trip.currency,
  };
}

function rootIntent({ userId, trip, remoteRoot }) {
  if (!remoteRoot) {
    return {
      userId,
      tripId: trip.id,
      entityType: 'trip',
      entityId: trip.id,
      serverVersion: 0,
      serverStatus: 'missing',
      desiredStatus: V4_ENTITY_STATUS.ACTIVE,
      payload: rootPayload(trip),
    };
  }

  if (Number(remoteRoot.schemaVersion) !== 4) {
    throw new TypeError('El root remoto no usa Storage v4.');
  }
  const version = remoteVersion(remoteRoot.version, 'trip');
  const status = remoteStatus(remoteRoot.status, 'trip');
  if (status !== V4_ENTITY_STATUS.ACTIVE) {
    throw new Error('Un viaje v4 eliminado requiere restore explícito antes de guardarse.');
  }

  const desired = rootPayload(trip);
  const current = rootPayload({
    id: remoteRoot.id || trip.id,
    name: remoteRoot.name,
    currency: remoteRoot.currency,
  });
  if (samePayload(current, desired)) return null;

  return {
    userId,
    tripId: trip.id,
    entityType: 'trip',
    entityId: trip.id,
    serverVersion: version,
    serverStatus: status,
    desiredStatus: V4_ENTITY_STATUS.ACTIVE,
    payload: desired,
  };
}

function childIntentsForCollection({
  userId,
  tripId,
  entityType,
  desiredItems,
  remoteItems,
}) {
  assertUniqueIds(desiredItems, entityType);
  assertUniqueIds(remoteItems, `remote.${entityType}`);

  const remoteById = new Map(remoteItems.map((item) => [requiredText(item.id, 'remote.id'), item]));
  const desiredIds = new Set();
  const intents = [];

  desiredItems.forEach((item, index) => {
    const entityId = requiredText(item.id, `${entityType}.id`);
    desiredIds.add(entityId);
    const rank = initialRankForPosition(index);
    const payload = v4EntityPayload(entityType, item, rank);
    const remote = remoteById.get(entityId) || null;

    if (!remote) {
      intents.push({
        userId,
        tripId,
        entityType,
        entityId,
        serverVersion: 0,
        serverStatus: 'missing',
        desiredStatus: V4_ENTITY_STATUS.ACTIVE,
        payload,
      });
      return;
    }

    const version = remoteVersion(remote.version, `remote.${entityType}`);
    const status = remoteStatus(remote.status, `remote.${entityType}`);
    if (status === V4_ENTITY_STATUS.DELETED) {
      intents.push({
        userId,
        tripId,
        entityType,
        entityId,
        serverVersion: version,
        serverStatus: status,
        desiredStatus: V4_ENTITY_STATUS.ACTIVE,
        payload,
      });
      return;
    }

    const currentPayload = v4EntityPayload(entityType, remote, remote.rank);
    if (!samePayload(currentPayload, payload)) {
      intents.push({
        userId,
        tripId,
        entityType,
        entityId,
        serverVersion: version,
        serverStatus: status,
        desiredStatus: V4_ENTITY_STATUS.ACTIVE,
        payload,
      });
    }
  });

  for (const remote of remoteItems) {
    const entityId = requiredText(remote.id, `remote.${entityType}.id`);
    if (desiredIds.has(entityId)) continue;
    const status = remoteStatus(remote.status, `remote.${entityType}`);
    if (status === V4_ENTITY_STATUS.DELETED) continue;
    intents.push({
      userId,
      tripId,
      entityType,
      entityId,
      serverVersion: remoteVersion(remote.version, `remote.${entityType}`),
      serverStatus: status,
      desiredStatus: V4_ENTITY_STATUS.DELETED,
      payload: null,
    });
  }

  return intents;
}

export function planV4TripSave({ uid, rawTrip, remoteRoot = null, remoteCollections = {} } = {}) {
  const userId = requiredText(uid, 'uid');
  const trip = normalizeTripForV4Plan(rawTrip);
  const root = rootIntent({ userId, trip, remoteRoot });
  const childIntents = [];

  let remoteChildCount = 0;
  for (const { tripField, entityType } of V4_TRIP_SAVE_COLLECTIONS) {
    const desiredItems = Array.isArray(trip[tripField]) ? trip[tripField] : [];
    const remoteItems = Array.isArray(remoteCollections[tripField])
      ? remoteCollections[tripField]
      : [];
    remoteChildCount += remoteItems.length;
    childIntents.push(...childIntentsForCollection({
      userId,
      tripId: trip.id,
      entityType,
      desiredItems,
      remoteItems,
    }));
  }

  if (!remoteRoot && remoteChildCount > 0) {
    throw new Error('No se puede crear un root v4 sobre colecciones hijas huérfanas.');
  }

  return {
    trip,
    createsRoot: Boolean(root && root.serverStatus === 'missing'),
    rootIntent: root,
    childIntents,
    intents: root ? [root, ...childIntents] : childIntents,
  };
}
