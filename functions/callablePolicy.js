import { createHash } from 'node:crypto';
import { Timestamp } from 'firebase-admin/firestore';
import { HttpsError } from 'firebase-functions/v2/https';
import { defineBoolean } from 'firebase-functions/params';
import { error as logError } from 'firebase-functions/logger';

const ENFORCE_APP_CHECK = defineBoolean('ENFORCE_APP_CHECK', {
  default: false,
  description: 'Rechaza llamadas sin un token válido de Firebase App Check.',
});

const BASE_CALLABLE_OPTIONS = Object.freeze({
  region: 'us-central1',
  enforceAppCheck: ENFORCE_APP_CHECK,
  memory: '256MiB',
  timeoutSeconds: 30,
  maxInstances: 10,
  concurrency: 20,
});

function hash(value) {
  return createHash('sha256').update(String(value)).digest('hex');
}

function requestIp(request) {
  const forwarded = request.rawRequest?.headers?.['x-forwarded-for'];
  const forwardedIp = Array.isArray(forwarded) ? forwarded[0] : forwarded;
  return String(forwardedIp || request.rawRequest?.ip || '')
    .split(',')[0]
    .trim();
}

function requestPrincipal(request) {
  if (request.auth?.uid) return `uid:${request.auth.uid}`;
  const ip = requestIp(request);
  if (!ip) {
    throw new HttpsError(
      'unauthenticated',
      'No fue posible verificar el origen de la solicitud.'
    );
  }
  return `ip:${hash(ip)}`;
}

export function callableOptions(overrides = {}) {
  return { ...BASE_CALLABLE_OPTIONS, ...overrides };
}

export function requireAuthenticated(request) {
  const uid = String(request.auth?.uid || '').trim();
  if (!uid) {
    throw new HttpsError(
      'unauthenticated',
      'Esta operación requiere una sesión autenticada.'
    );
  }
  return uid;
}

export async function enforceQuota(
  db,
  request,
  { scope, maxRequests, windowMs }
) {
  const safeScope = String(scope || '').trim();
  const safeMax = Math.max(1, Math.trunc(Number(maxRequests) || 1));
  const safeWindow = Math.max(1_000, Math.trunc(Number(windowMs) || 60_000));
  if (!safeScope) throw new Error('La cuota requiere un scope.');

  const principal = requestPrincipal(request);
  const now = Date.now();
  const windowStart = Math.floor(now / safeWindow) * safeWindow;
  const ref = db.collection('functionRateLimits').doc(hash(`${safeScope}:${principal}`));

  try {
    await db.runTransaction(async (transaction) => {
      const snapshot = await transaction.get(ref);
      const data = snapshot.data();
      const currentWindow = Number(data?.windowStart) || 0;
      const currentCount = Number(data?.count) || 0;

      if (currentWindow === windowStart && currentCount >= safeMax) {
        throw new HttpsError(
          'resource-exhausted',
          'Se alcanzó temporalmente el límite de solicitudes. Inténtalo más tarde.'
        );
      }

      transaction.set(ref, {
        scope: safeScope,
        principalHash: hash(principal),
        windowStart,
        count: currentWindow === windowStart ? currentCount + 1 : 1,
        expiresAt: Timestamp.fromMillis(windowStart + (safeWindow * 2)),
      });
    });
  } catch (error) {
    if (error instanceof HttpsError) throw error;
    logError('Callable quota validation failed.', {
      scope: safeScope,
      errorName: error?.name || 'Error',
      errorCode: error?.code || '',
    });
    throw new HttpsError(
      'unavailable',
      'No fue posible validar temporalmente el límite de solicitudes.'
    );
  }
}
