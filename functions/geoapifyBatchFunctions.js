import { FieldValue, Timestamp } from 'firebase-admin/firestore';
import { onCall, HttpsError } from 'firebase-functions/v2/https';
import {
  callableOptions,
  enforceQuota,
  requireAuthenticated,
} from './callablePolicy.js';
import { cacheId } from './sharedCache.js';
import {
  BATCH_JOB_TTL_MS,
  CACHE_TTL_MS,
  GEOAPIFY_API_KEY,
  QUOTAS,
  db,
} from './geoapifyRuntime.js';
import {
  batchResultItem,
  limitedFetch,
  mapPlace,
  normalized,
  requireGeoapifyKey,
} from './geoapifySupport.js';

const MAX_BATCH_QUERY_CHARS = 160;

async function cacheCompletedBatchRows(rows, mappedResults) {
  const writer = db.bulkWriter();
  const expiresAt = Timestamp.fromMillis(Date.now() + CACHE_TTL_MS);

  rows.forEach((row, index) => {
    const queryKey = normalized(row?.query?.text || row?.query || '');
    const result = mappedResults[index];
    if (queryKey.length < 5 || !result) return;

    const ref = db.collection('geocodeCache').doc(cacheId(`batch:${queryKey}`));
    writer.set(ref, {
      result,
      timestamp: FieldValue.serverTimestamp(),
      expiresAt,
    });
  });

  await writer.close();
}

export const geoapifyBatchGeocode = onCall(
  callableOptions({
    secrets: [GEOAPIFY_API_KEY],
    timeoutSeconds: 60,
    maxInstances: 2,
    concurrency: 2,
  }),
  async (request) => {
    const uid = requireAuthenticated(request);
    await enforceQuota(db, request, QUOTAS.batchSubmit);
    const rawQueries = Array.isArray(request.data?.queries) ? request.data.queries : [];

    if (!rawQueries.length || rawQueries.length > 1000) {
      throw new HttpsError(
        'invalid-argument',
        'El batch requiere entre 1 y 1,000 ubicaciones.'
      );
    }

    const queries = rawQueries.map((query) => String(query || '').trim());
    if (queries.some((query) => normalized(query).length < 5)) {
      throw new HttpsError(
        'invalid-argument',
        'Cada ubicación del batch requiere al menos 5 caracteres.'
      );
    }
    if (queries.some((query) => query.length > MAX_BATCH_QUERY_CHARS)) {
      throw new HttpsError(
        'invalid-argument',
        `Cada ubicación del batch admite hasta ${MAX_BATCH_QUERY_CHARS} caracteres.`
      );
    }

    const params = new URLSearchParams({
      apiKey: requireGeoapifyKey(GEOAPIFY_API_KEY),
    });
    const job = await limitedFetch(
      `https://api.geoapify.com/v1/batch/geocode/search?${params}`,
      {
        method: 'POST',
        headers: {
          Accept: 'application/json',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(queries),
      }
    );
    const jobId = String(job?.id || '').trim();
    if (!jobId) throw new Error('Geoapify no devolvió un identificador de batch.');

    const now = Date.now();
    await db.collection('geoapifyBatchJobs').doc(cacheId(jobId)).set({
      ownerUid: uid,
      providerJobId: jobId,
      queryCount: queries.length,
      createdAt: FieldValue.serverTimestamp(),
      expiresAt: Timestamp.fromMillis(now + BATCH_JOB_TTL_MS),
    });

    return {
      jobId,
      status: 'pending',
      queryCount: queries.length,
    };
  }
);

export const geoapifyBatchGeocodeResult = onCall(
  callableOptions({
    secrets: [GEOAPIFY_API_KEY],
    timeoutSeconds: 60,
    maxInstances: 4,
    concurrency: 10,
  }),
  async (request) => {
    const uid = requireAuthenticated(request);
    await enforceQuota(db, request, QUOTAS.batchResult);
    const jobId = String(request.data?.jobId || '').trim();
    if (!/^[A-Za-z0-9_-]{8,160}$/.test(jobId)) {
      throw new HttpsError('invalid-argument', 'Identificador de batch inválido.');
    }

    const jobSnapshot = await db.collection('geoapifyBatchJobs').doc(cacheId(jobId)).get();
    const job = jobSnapshot.data();
    if (!job || job.ownerUid !== uid || job.providerJobId !== jobId) {
      throw new HttpsError('not-found', 'No existe un batch accesible con ese identificador.');
    }
    if ((job.expiresAt?.toMillis?.() || 0) <= Date.now()) {
      throw new HttpsError('not-found', 'El resultado del batch ya expiró.');
    }

    const params = new URLSearchParams({
      id: jobId,
      apiKey: requireGeoapifyKey(GEOAPIFY_API_KEY),
    });
    const payload = await limitedFetch(
      `https://api.geoapify.com/v1/batch/geocode/search?${params}`
    );

    if (!Array.isArray(payload)) {
      return { jobId, status: String(payload?.status || 'pending'), results: [] };
    }

    const results = payload.map((item) => mapPlace(batchResultItem(item)));
    await cacheCompletedBatchRows(payload, results);
    return { jobId, status: 'completed', results };
  }
);
