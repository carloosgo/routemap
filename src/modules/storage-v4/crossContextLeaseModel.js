function requirePositiveMs(value, field) {
  if (!Number.isFinite(value) || value <= 0) {
    throw new TypeError(`${field} debe ser un número positivo.`);
  }
  return value;
}

function requireContextId(value) {
  const id = typeof value === 'string' ? value.trim() : '';
  if (!id) throw new TypeError('contextId es obligatorio.');
  return id;
}

export function leaseIsExpired(lease, nowMs) {
  requirePositiveMs(nowMs, 'nowMs');
  if (!lease) return true;
  return !Number.isFinite(lease.expiresAt) || lease.expiresAt <= nowMs;
}

export function acquireOrRenewLease({
  currentLease = null,
  contextId,
  nowMs,
  ttlMs = 8000,
} = {}) {
  const ownerContextId = requireContextId(contextId);
  requirePositiveMs(nowMs, 'nowMs');
  requirePositiveMs(ttlMs, 'ttlMs');

  const sameOwner = currentLease?.ownerContextId === ownerContextId;
  const expired = leaseIsExpired(currentLease, nowMs);
  if (currentLease && !sameOwner && !expired) return null;

  const takeover = !currentLease || !sameOwner || expired;
  const generation = takeover
    ? (Number(currentLease?.generation) || 0) + 1
    : currentLease.generation;

  return {
    ownerContextId,
    generation,
    acquiredAt: takeover ? nowMs : currentLease.acquiredAt,
    renewedAt: nowMs,
    expiresAt: nowMs + ttlMs,
  };
}

export function leaseStillOwned(lease, { contextId, generation, nowMs } = {}) {
  if (!lease || leaseIsExpired(lease, nowMs)) return false;
  return lease.ownerContextId === requireContextId(contextId)
    && lease.generation === generation;
}
