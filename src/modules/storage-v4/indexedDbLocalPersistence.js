import {
  normalizeDraftRecord,
  normalizeLocalEntityRecord,
  normalizeMutationRecord,
} from './localPersistenceContract.js';
import {
  acquireOrRenewLease,
  leaseStillOwned,
} from './crossContextLeaseModel.js';

const DB_VERSION = 1;
const DEFAULT_DB_NAME = 'atlas-storage-v4';
const LEASE_KEY = 'sync-leader';

function requestResult(request) {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error || new Error('IndexedDB request failed.'));
  });
}

function transactionDone(transaction) {
  return new Promise((resolve, reject) => {
    transaction.oncomplete = () => resolve();
    transaction.onabort = () => reject(transaction.error || new Error('IndexedDB transaction aborted.'));
    transaction.onerror = () => reject(transaction.error || new Error('IndexedDB transaction failed.'));
  });
}

function ensureIndex(store, name, keyPath) {
  if (!store.indexNames.contains(name)) store.createIndex(name, keyPath, { unique: false });
}

function upgradeDatabase(db, transaction) {
  const drafts = db.objectStoreNames.contains('drafts')
    ? transaction.objectStore('drafts')
    : db.createObjectStore('drafts', { keyPath: 'key' });
  ensureIndex(drafts, 'scopeId', 'scopeId');

  const entities = db.objectStoreNames.contains('entities')
    ? transaction.objectStore('entities')
    : db.createObjectStore('entities', { keyPath: 'key' });
  ensureIndex(entities, 'userId', 'userId');
  ensureIndex(entities, 'tripId', 'tripId');

  const mutations = db.objectStoreNames.contains('mutations')
    ? transaction.objectStore('mutations')
    : db.createObjectStore('mutations', { keyPath: 'entityKey' });
  ensureIndex(mutations, 'userId', 'userId');

  if (!db.objectStoreNames.contains('meta')) {
    db.createObjectStore('meta', { keyPath: 'key' });
  }
}

function openDatabase(indexedDb, name) {
  return new Promise((resolve, reject) => {
    const request = indexedDb.open(name, DB_VERSION);
    request.onupgradeneeded = () => upgradeDatabase(request.result, request.transaction);
    request.onerror = () => reject(request.error || new Error('No fue posible abrir IndexedDB.'));
    request.onblocked = () => reject(new Error('La actualización de IndexedDB está bloqueada por otro contexto.'));
    request.onsuccess = () => {
      const db = request.result;
      db.onversionchange = () => db.close();
      resolve(db);
    };
  });
}

async function readOne(dbPromise, storeName, key) {
  const db = await dbPromise;
  const transaction = db.transaction(storeName, 'readonly');
  const result = await requestResult(transaction.objectStore(storeName).get(key));
  await transactionDone(transaction);
  return result || null;
}

async function putOne(dbPromise, storeName, value) {
  const db = await dbPromise;
  const transaction = db.transaction(storeName, 'readwrite');
  await requestResult(transaction.objectStore(storeName).put(value));
  await transactionDone(transaction);
  return value;
}

async function deleteOne(dbPromise, storeName, key) {
  const db = await dbPromise;
  const transaction = db.transaction(storeName, 'readwrite');
  await requestResult(transaction.objectStore(storeName).delete(key));
  await transactionDone(transaction);
  return true;
}

async function listByUser(dbPromise, storeName, userId, tripId) {
  const db = await dbPromise;
  const transaction = db.transaction(storeName, 'readonly');
  const rows = await requestResult(
    transaction.objectStore(storeName).index('userId').getAll(userId)
  );
  await transactionDone(transaction);
  return rows.filter((row) => tripId == null || row.tripId === tripId);
}

function atomicLeaseUpdate(dbPromise, decide) {
  return dbPromise.then((db) => new Promise((resolve, reject) => {
    const transaction = db.transaction('meta', 'readwrite');
    const store = transaction.objectStore('meta');
    let result = null;
    transaction.onerror = () => reject(transaction.error || new Error('Lease transaction failed.'));
    transaction.onabort = () => reject(transaction.error || new Error('Lease transaction aborted.'));
    transaction.oncomplete = () => resolve(result);
    const read = store.get(LEASE_KEY);
    read.onerror = () => transaction.abort();
    read.onsuccess = () => {
      const current = read.result?.value || null;
      const decision = decide(current);
      result = decision.result;
      if (decision.write === false) return;
      if (decision.value == null) store.delete(LEASE_KEY);
      else store.put({ key: LEASE_KEY, value: decision.value });
    };
  }));
}

function clearIndexMatches(store, indexName, value) {
  const cursor = store.index(indexName).openCursor(value);
  cursor.onsuccess = () => {
    const current = cursor.result;
    if (!current) return;
    current.delete();
    current.continue();
  };
}

export function createIndexedDbV4LocalPersistence({
  indexedDb = globalThis.indexedDB,
  dbName = DEFAULT_DB_NAME,
} = {}) {
  if (!indexedDb || typeof indexedDb.open !== 'function') {
    throw new Error('IndexedDB no está disponible en este entorno.');
  }
  const dbPromise = openDatabase(indexedDb, dbName);

  return {
    async getDraft(key) {
      return readOne(dbPromise, 'drafts', key);
    },
    async putDraft(record) {
      return putOne(dbPromise, 'drafts', normalizeDraftRecord(record));
    },
    async deleteDraft(key) {
      return deleteOne(dbPromise, 'drafts', key);
    },
    async getEntity(key) {
      return readOne(dbPromise, 'entities', key);
    },
    async putEntity(record) {
      return putOne(dbPromise, 'entities', normalizeLocalEntityRecord(record));
    },
    async listEntities({ userId, tripId = null } = {}) {
      return listByUser(dbPromise, 'entities', userId, tripId);
    },
    async getMutation(entityKey) {
      return readOne(dbPromise, 'mutations', entityKey);
    },
    async putMutation(record) {
      return putOne(dbPromise, 'mutations', normalizeMutationRecord(record));
    },
    async listMutations({ userId, tripId = null } = {}) {
      const rows = await listByUser(dbPromise, 'mutations', userId, tripId);
      return rows.sort((left, right) => left.createdAtLocal - right.createdAtLocal);
    },
    async deleteMutationIfRevision(entityKey, expectedLocalRevision) {
      const db = await dbPromise;
      return new Promise((resolve, reject) => {
        const transaction = db.transaction('mutations', 'readwrite');
        const store = transaction.objectStore('mutations');
        let deleted = false;
        transaction.onerror = () => reject(transaction.error || new Error('Mutation ack failed.'));
        transaction.onabort = () => reject(transaction.error || new Error('Mutation ack aborted.'));
        transaction.oncomplete = () => resolve(deleted);
        const read = store.get(entityKey);
        read.onerror = () => transaction.abort();
        read.onsuccess = () => {
          const current = read.result;
          if (current?.localRevision === expectedLocalRevision) {
            store.delete(entityKey);
            deleted = true;
          }
        };
      });
    },
    async tryAcquireSyncLease({ contextId, nowMs, ttlMs }) {
      return atomicLeaseUpdate(dbPromise, (current) => {
        const next = acquireOrRenewLease({ currentLease: current, contextId, nowMs, ttlMs });
        return next
          ? { write: true, value: next, result: next }
          : { write: false, result: null };
      });
    },
    async releaseSyncLeaseIfOwned({ contextId, generation, nowMs }) {
      return atomicLeaseUpdate(dbPromise, (current) => {
        const owned = leaseStillOwned(current, { contextId, generation, nowMs });
        return owned
          ? { write: true, value: null, result: true }
          : { write: false, result: false };
      });
    },
    async clearUserData(userId) {
      const db = await dbPromise;
      const transaction = db.transaction(['entities', 'mutations'], 'readwrite');
      clearIndexMatches(transaction.objectStore('entities'), 'userId', userId);
      clearIndexMatches(transaction.objectStore('mutations'), 'userId', userId);
      await transactionDone(transaction);
    },
    async close() {
      const db = await dbPromise;
      db.close();
    },
  };
}
