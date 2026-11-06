/* global process */
import { createHash } from 'node:crypto';
import { Timestamp } from 'firebase-admin/firestore';
import { HttpsError } from 'firebase-functions/v2/https';
import { error as logError } from 'firebase-functions/logger';

export function parseAppCheckEnforcementEnv(value) {
  return String(value ?? '').trim().toLowerCase() === 'true';
}

export const ENFORCE_APP_CHECK = parseAppCheckEnforcementEnv(
  process.env.ENFORCE_APP_CHECK
);

const BASE_CALLABLE_OPTIONS = Object.freeze({
  region: 'us-central1',
  enforceAppCheck: ENFORCE_APP_CHECK,
  consumeAppCheckToken: false,
  memory: '256MiB',
  timeoutSeconds: 30,
  maxInstances: 10,
  concurrency: 20,
});

function hash(value) {
  return createHash('sha256').update(String(value)).digest('hex');
}

export function callableOptions(overrides = {}) {
  const safeOverrides = { ...overrides };
  const enforceAppCheck = Object.hasOwn(safeOverrides, 'enforceAppCheck')
    ? safeOverrides.enforceAppCheck === true
    : ENFORCE_APP_CHECK;
  delete safeOverrides.enforceAppCheck;
  delete safeOverrides.consumeAppCheckToken;
  return {
    ...BASE_CALLABLE_OPTIONS,
    ...safeOverrides,
    enforceAppCheck,
    consumeAppCheckToken: false,
  };
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

  // Toda callable con cuota llama a un proveedor de pago (Google/Geoapify).
  // Exigimos sesión para que el límite se aplique por UID: un límite por IP
  // se puede evadir cambiando X-Forwarded-For, que controla el cliente.
  const principal = `uid:${requireAuthenticated(request)}`;
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
