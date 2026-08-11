import {
  normalizeTrip,
  placeForPersistence,
  tripTotal,
} from '../trips/tripModel.js';
import { initialRankForPosition } from './rankModel.js';
import { STORAGE_V4_VERSION, V4_ENTITY_STATUS } from './storageV4Contract.js';

const COLLECTION_SPECS = Object.freeze([
  ['segments', 'segments'],
  ['places', 'places'],
  ['connections', 'routeConnections'],
  ['notes', 'notes'],
  ['checklist', 'checklist'],
]);

function issue(issues, code, path, detail = '') {
  issues.push({ code, path, detail });
}

function sameJson(left, right) {
  return JSON.stringify(left) === JSON.stringify(right);
}

function expectedEntity(collectionName, source, rank) {
  if (collectionName === 'segments') {
    return { ...source, rank };
  }
  if (collectionName === 'places') {
    return { ...placeForPersistence(source), rank };
  }
  if (collectionName === 'connections') {
    return {
      id: source.id,
      rank,
      fromPlaceId: source.fromPlaceId,
      toPlaceId: source.toPlaceId,
      mode: source.mode,
      visible: source.visible,
    };
  }
  if (collectionName === 'notes') {
    return {
      id: source.id,
      rank,
      title: source.title,
      text: source.text,
    };
  }
  if (collectionName === 'checklist') {
    return {
      id: source.id,
      rank,
      text: source.text,
      done: source.done,
    };
  }
  throw new TypeError('Colección de migración v4 desconocida.');
}

function canonicalEntity(document) {
  if (!document || typeof document !== 'object') return null;
  const copy = { ...document };
  delete copy.status;
  delete copy.version;
  delete copy.createdAt;
  delete copy.updatedAt;
  delete copy.deletedAt;
  return copy;
}

function verifyLifecycle(document, path, issues) {
  if (document?.status !== V4_ENTITY_STATUS.ACTIVE) {
    issue(issues, 'entity-status', path, 'La entidad migrada debe iniciar activa.');
  }
  if (document?.version !== 1) {
    issue(issues, 'entity-version', path, 'La entidad migrada debe iniciar en versión 1.');
  }
  if (document?.deletedAt !== null) {
    issue(issues, 'entity-deleted-at', path, 'La entidad migrada no puede iniciar eliminada.');
  }
  if (document?.createdAt == null || document?.updatedAt == null) {
    issue(issues, 'entity-timestamps', path, 'Faltan timestamps de lifecycle.');
  }
}

function verifyCollections(trip, snapshot, issues) {
  const targetCollections = snapshot?.collections || {};
  const placeIds = new Set(trip.places.map((place) => place.id));

  for (const [targetName, sourceName] of COLLECTION_SPECS) {
    const source = Array.isArray(trip[sourceName]) ? trip[sourceName] : [];
    const target = Array.isArray(targetCollections[targetName])
      ? targetCollections[targetName]
      : [];
    if (target.length !== source.length) {
      issue(
        issues,
        'collection-count',
        `collections.${targetName}`,
        `Esperado ${source.length}, recibido ${target.length}.`
      );
    }

    const seenIds = new Set();
    const count = Math.min(source.length, target.length);
    for (let index = 0; index < count; index += 1) {
      const path = `collections.${targetName}[${index}]`;
      const sourceEntity = source[index];
      const targetEntity = target[index];
      const expectedRank = initialRankForPosition(index);
      if (targetEntity?.id !== sourceEntity?.id) {
        issue(issues, 'entity-id', path, 'El ID cambió durante la migración.');
      }
      if (seenIds.has(targetEntity?.id)) {
        issue(issues, 'duplicate-id', path, 'El snapshot v4 contiene un ID duplicado.');
      }
      seenIds.add(targetEntity?.id);
      if (targetEntity?.rank !== expectedRank) {
        issue(issues, 'entity-rank', path, 'El rank no conserva el orden v3.');
      }
      verifyLifecycle(targetEntity, path, issues);

      const expected = expectedEntity(targetName, sourceEntity, expectedRank);
      const actual = canonicalEntity(targetEntity);
      if (!sameJson(actual, expected)) {
        issue(issues, 'entity-content', path, 'El contenido persistible difiere del v3 canónico.');
      }

      if (targetName === 'connections') {
        if (!placeIds.has(targetEntity?.fromPlaceId) || !placeIds.has(targetEntity?.toPlaceId)) {
          issue(issues, 'connection-reference', path, 'La conexión referencia un lugar inexistente.');
        }
      }
    }
  }
}

export function verifyV3ToV4Materialization(rawTrip, snapshot) {
  const issues = [];
  if (!rawTrip || typeof rawTrip !== 'object') {
    return { ok: false, issues: [{ code: 'source-missing', path: 'source', detail: '' }] };
  }
  const trip = normalizeTrip(rawTrip);
  const root = snapshot?.root;

  if (!root || typeof root !== 'object') {
    issue(issues, 'root-missing', 'root');
  } else {
    if (root.id !== trip.id) issue(issues, 'root-id', 'root.id');
    if (root.name !== trip.name) issue(issues, 'root-name', 'root.name');
    if (root.currency !== trip.currency) issue(issues, 'root-currency', 'root.currency');
    if (root.schemaVersion !== STORAGE_V4_VERSION) issue(issues, 'root-schema', 'root.schemaVersion');
    if (root.status !== V4_ENTITY_STATUS.ACTIVE) issue(issues, 'root-status', 'root.status');
    if (root.version !== 1) issue(issues, 'root-version', 'root.version');
    if (root.deletedAt !== null || root.purgeAfter !== null) {
      issue(issues, 'root-delete-state', 'root');
    }
    if (root.segmentCount !== trip.segments.length) {
      issue(issues, 'root-segment-count', 'root.segmentCount');
    }
    if (root.placeCount !== trip.places.length) {
      issue(issues, 'root-place-count', 'root.placeCount');
    }
    if (root.total !== tripTotal(trip)) issue(issues, 'root-total', 'root.total');
    if (root.createdAt == null || root.updatedAt == null) {
      issue(issues, 'root-timestamps', 'root');
    }
  }

  verifyCollections(trip, snapshot, issues);
  return {
    ok: issues.length === 0,
    issues,
    expected: {
      tripId: trip.id,
      segmentCount: trip.segments.length,
      placeCount: trip.places.length,
      connectionCount: trip.routeConnections.length,
      noteCount: trip.notes.length,
      checklistCount: trip.checklist.length,
      total: tripTotal(trip),
    },
  };
}
