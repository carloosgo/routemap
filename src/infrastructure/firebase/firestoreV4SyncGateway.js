import {
  V4_REMOTE_ERROR_KIND,
  V4RemoteSyncError,
} from '../../modules/storage-v4/syncCoordinator.js';
import { V4_MUTATION_OPERATIONS } from '../../modules/storage-v4/storageV4Contract.js';

const RETRYABLE_CODES = new Set([
  'aborted',
  'deadline-exceeded',
  'unavailable',
]);

function errorCode(error) {
  const code = typeof error?.code === 'string' ? error.code : '';
  return code.startsWith('firestore/') ? code.slice('firestore/'.length) : code;
}

function requiredRepository(repository) {
  const methods = [
    'createTripRoot',
    'updateTripMetadata',
    'getTripSummary',
    'createEntity',
    'updateEntity',
    'softDeleteEntity',
    'restoreEntity',
    'getEntity',
  ];
  for (const method of methods) {
    if (typeof repository?.[method] !== 'function') {
      throw new TypeError(`El repositorio Firestore v4 requiere ${method}().`);
    }
  }
  return repository;
}

function payloadWithId(mutation) {
  return {
    ...(mutation.payload || {}),
    id: mutation.entityId,
  };
}

function remotePayload(snapshot) {
  if (!snapshot) return null;
  const {
    status,
    version,
    createdAt,
    updatedAt,
    deletedAt,
    purgeAfter,
    schemaVersion,
    segmentCount,
    placeCount,
    total,
    ...payload
  } = snapshot;
  return payload;
}

function normalizedRemoteEntity(snapshot) {
  if (!snapshot || !Number.isInteger(snapshot.version)) return null;
  if (snapshot.status !== 'active' && snapshot.status !== 'deleted') return null;
  return {
    serverVersion: snapshot.version,
    serverStatus: snapshot.status,
    payload: remotePayload(snapshot),
  };
}

async function readCurrent(repository, mutation) {
  const snapshot = mutation.entityType === 'trip'
    ? await repository.getTripSummary(mutation.entityId)
    : await repository.getEntity(
      mutation.tripId,
      mutation.entityType,
      mutation.entityId
    );
  return normalizedRemoteEntity(snapshot);
}

async function writeTrip(repository, mutation) {
  const payload = payloadWithId(mutation);
  if (mutation.operation === V4_MUTATION_OPERATIONS.CREATE) {
    const result = await repository.createTripRoot(payload);
    return { serverVersion: result.version, serverStatus: 'active' };
  }
  if (mutation.operation === V4_MUTATION_OPERATIONS.UPDATE) {
    const result = await repository.updateTripMetadata(payload, mutation.baseVersion);
    return { serverVersion: result.version, serverStatus: 'active' };
  }
  throw new TypeError('DELETE/RESTORE de viaje pertenece al gate de lifecycle v4.');
}

async function writeChild(repository, mutation) {
  const payload = payloadWithId(mutation);
  const rank = mutation.payload?.rank;
  if (mutation.operation === V4_MUTATION_OPERATIONS.CREATE) {
    const result = await repository.createEntity(
      mutation.tripId,
      mutation.entityType,
      payload,
      rank
    );
    return { serverVersion: result.version, serverStatus: 'active' };
  }
  if (mutation.operation === V4_MUTATION_OPERATIONS.UPDATE) {
    const result = await repository.updateEntity(
      mutation.tripId,
      mutation.entityType,
      payload,
      rank,
      mutation.baseVersion
    );
    return { serverVersion: result.version, serverStatus: 'active' };
  }
  if (mutation.operation === V4_MUTATION_OPERATIONS.DELETE) {
    const result = await repository.softDeleteEntity(
      mutation.tripId,
      mutation.entityType,
      mutation.entityId,
      mutation.baseVersion
    );
    return { serverVersion: result.version, serverStatus: 'deleted' };
  }
  const result = await repository.restoreEntity(
    mutation.tripId,
    mutation.entityType,
    mutation.entityId,
    mutation.baseVersion
  );
  return { serverVersion: result.version, serverStatus: 'active' };
}

export function createFirestoreV4SyncGateway({ repository } = {}) {
  const store = requiredRepository(repository);

  return {
    async writeMutation(mutation) {
      try {
        return mutation.entityType === 'trip'
          ? await writeTrip(store, mutation)
          : await writeChild(store, mutation);
      } catch (error) {
        const code = errorCode(error);
        if (RETRYABLE_CODES.has(code)) {
          throw new V4RemoteSyncError(
            V4_REMOTE_ERROR_KIND.RETRYABLE,
            'Firestore rechazó temporalmente la escritura.',
            { cause: error }
          );
        }
        if (code !== 'permission-denied') throw error;

        let remoteEntity = null;
        try {
          remoteEntity = await readCurrent(store, mutation);
        } catch {
          throw error;
        }
        if (!remoteEntity || remoteEntity.serverVersion <= mutation.baseVersion) {
          throw error;
        }
        throw new V4RemoteSyncError(
          V4_REMOTE_ERROR_KIND.CONFLICT,
          'La entidad remota avanzó desde la versión base.',
          { cause: error, remoteEntity }
        );
      }
    },
  };
}
