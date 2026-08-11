import { createHash } from 'node:crypto';
import { FieldValue, Timestamp } from 'firebase-admin/firestore';

const inFlightLoads = new Map();

export function cacheId(value) {
  return createHash('sha256').update(String(value)).digest('hex');
}

function hasOwnResult(data) {
  return Boolean(data) && Object.prototype.hasOwnProperty.call(data, 'result');
}

function reportCacheError(onCacheError, { phase, collection, error }) {
  if (typeof onCacheError !== 'function') return;
  try {
    onCacheError({
      phase,
      collection,
      errorName: error?.name || 'Error',
      errorCode: typeof error?.code === 'string' ? error.code : '',
    });
  } catch {
    // La observabilidad nunca debe convertir un miss de cache en un fallo funcional.
  }
}

function reportCacheMetric(onCacheMetric, { outcome, collection, error }) {
  if (typeof onCacheMetric !== 'function') return;
  try {
    const metric = { outcome, collection };
    if (error) {
      metric.errorName = error?.name || 'Error';
      metric.errorCode = typeof error?.code === 'string' ? error.code : '';
    }
    onCacheMetric(metric);
  } catch {
    // Las métricas son best-effort y nunca forman parte del camino funcional.
  }
}

export function createSharedCache(db, { ttlMs, onCacheError, onCacheMetric } = {}) {
  const safeTtlMs = Math.max(60_000, Math.trunc(Number(ttlMs) || 0));

  return async function cached(collection, key, loader) {
    const documentId = cacheId(key);
    const ref = db.collection(collection).doc(documentId);
    let data = null;

    try {
      const snapshot = await ref.get();
      data = snapshot.data();
    } catch (error) {
      reportCacheError(onCacheError, { phase: 'read', collection, error });
      reportCacheMetric(onCacheMetric, { outcome: 'read-error', collection, error });
    }

    const timestamp = data?.timestamp?.toMillis?.() || 0;
    const expiresAt = data?.expiresAt?.toMillis?.() || (timestamp + safeTtlMs);

    if (hasOwnResult(data) && Date.now() < expiresAt) {
      reportCacheMetric(onCacheMetric, { outcome: 'hit', collection });
      return { result: data.result, cacheHit: true };
    }

    reportCacheMetric(onCacheMetric, { outcome: 'miss', collection });
    const inFlightKey = `${collection}:${documentId}`;
    if (inFlightLoads.has(inFlightKey)) return inFlightLoads.get(inFlightKey);

    const pending = (async () => {
      const result = await loader();
      const now = Date.now();
      try {
        await ref.set({
          result,
          timestamp: FieldValue.serverTimestamp(),
          expiresAt: Timestamp.fromMillis(now + safeTtlMs),
        });
      } catch (error) {
        reportCacheError(onCacheError, { phase: 'write', collection, error });
        reportCacheMetric(onCacheMetric, { outcome: 'write-error', collection, error });
      }
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
