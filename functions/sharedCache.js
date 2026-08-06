import { createHash } from 'node:crypto';
import { FieldValue, Timestamp } from 'firebase-admin/firestore';

const inFlightLoads = new Map();

export function cacheId(value) {
  return createHash('sha256').update(String(value)).digest('hex');
}

function hasOwnResult(data) {
  return Boolean(data) && Object.prototype.hasOwnProperty.call(data, 'result');
}

export function createSharedCache(db, { ttlMs }) {
  const safeTtlMs = Math.max(60_000, Math.trunc(Number(ttlMs) || 0));

  return async function cached(collection, key, loader) {
    const documentId = cacheId(key);
    const ref = db.collection(collection).doc(documentId);
    const snapshot = await ref.get();
    const data = snapshot.data();
    const timestamp = data?.timestamp?.toMillis?.() || 0;
    const expiresAt = data?.expiresAt?.toMillis?.() || (timestamp + safeTtlMs);

    if (hasOwnResult(data) && Date.now() < expiresAt) {
      return { result: data.result, cacheHit: true };
    }

    const inFlightKey = `${collection}:${documentId}`;
    if (inFlightLoads.has(inFlightKey)) return inFlightLoads.get(inFlightKey);

    const pending = (async () => {
      const result = await loader();
      const now = Date.now();
      await ref.set({
        result,
        timestamp: FieldValue.serverTimestamp(),
        expiresAt: Timestamp.fromMillis(now + safeTtlMs),
      });
      return { result, cacheHit: false };
    })();

    inFlightLoads.set(inFlightKey, pending);
    try {
      return await pending;
    } finally {
      inFlightLoads.delete(inFlightKey);
    }
  };
}
