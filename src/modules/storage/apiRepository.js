import { normalizeTrip } from '../trips/tripModel.js';

const REQUEST_TIMEOUT_MS = 15_000;

export class ApiRepositoryError extends Error {
  constructor(message, { code = 'request_failed', status = 0, retryAfter = null } = {}) {
    super(message);
    this.name = 'ApiRepositoryError';
    this.code = code;
    this.status = status;
    this.retryAfter = retryAfter;
  }
}

function errorForResponse(response) {
  const status = Number(response?.status) || 0;
  const retryAfter = response?.headers?.get?.('retry-after') || null;

  if (status === 401) {
    return new ApiRepositoryError('La sesión expiró o no está disponible.', {
      code: 'session_expired',
      status,
    });
  }
  if (status === 409) {
    return new ApiRepositoryError('El viaje cambió en otro dispositivo.', {
      code: 'trip_version_conflict',
      status,
    });
  }
  if (status === 422) {
    return new ApiRepositoryError('El servidor rechazó datos inválidos.', {
      code: 'validation_failed',
      status,
    });
  }
  if (status === 429) {
    return new ApiRepositoryError('Se alcanzó temporalmente el límite de solicitudes.', {
      code: 'rate_limited',
      status,
      retryAfter,
    });
  }
  if (status >= 500) {
    return new ApiRepositoryError('El servicio no está disponible temporalmente.', {
      code: 'server_unavailable',
      status,
    });
  }
  return new ApiRepositoryError(`No se pudo completar la solicitud (HTTP ${status}).`, {
    status,
  });
}

// Implementación contra backend REST (para multiusuario / escala global).
// Mismo contrato que el repositorio local. El backend de referencia está
// documentado en /server/openapi.yaml.

export function createApiRepository(baseUrl) {
  const normalizedBaseUrl = (typeof baseUrl === 'string' ? baseUrl.trim() : '').replace(/\/+$/, '');
  const persistedIds = new Set();
  const etagsById = new Map();

  if (!normalizedBaseUrl) {
    throw new TypeError('Se requiere una URL base válida para el repositorio API.');
  }

  async function request(path, options = {}) {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
    const { onResponse, ...fetchOptions } = options;

    try {
      const res = await fetch(`${normalizedBaseUrl}${path}`, {
        ...fetchOptions,
        signal: controller.signal,
        headers: {
          Accept: 'application/json',
          'Content-Type': 'application/json',
          ...(fetchOptions.headers || {}),
        },
        credentials: 'include',
      });

      if (!res.ok) throw errorForResponse(res);

      onResponse?.(res);
      if (res.status === 204) return null;

      try {
        return await res.json();
      } catch {
        throw new ApiRepositoryError('El servidor devolvió una respuesta inválida.', {
          code: 'invalid_response',
          status: res.status,
        });
      }
    } catch (error) {
      if (error?.name === 'AbortError') {
        throw new ApiRepositoryError('La solicitud tardó demasiado y fue cancelada.', {
          code: 'request_timeout',
        });
      }
      throw error;
    } finally {
      clearTimeout(timeoutId);
    }
  }

  function requireId(id) {
    if (typeof id !== 'string' || !id.trim()) {
      throw new TypeError('Se requiere un identificador de viaje válido.');
    }
    return id.trim();
  }

  function remember(trip) {
    if (trip?.id) persistedIds.add(trip.id);
    return trip;
  }

  function rememberEtag(id, response) {
    const etag = response?.headers?.get?.('etag');
    if (id && etag) etagsById.set(id, etag);
  }

  function tripsFromListResponse(data) {
    if (Array.isArray(data)) return data;
    if (data && Array.isArray(data.items)) return data.items;
    return [];
  }

  return {
    async list() {
      const data = await request('/api/trips');
      const trips = tripsFromListResponse(data).map(normalizeTrip);
      persistedIds.clear();
      trips.forEach(remember);
      return trips;
    },

    async get(id) {
      const safeId = requireId(id);
      const data = await request(`/api/trips/${encodeURIComponent(safeId)}`, {
        onResponse: (response) => rememberEtag(safeId, response),
      });
      return data ? remember(normalizeTrip(data)) : null;
    },

    async save(trip) {
      const normalized = normalizeTrip(trip);
      const exists = persistedIds.has(normalized.id);
      const etag = etagsById.get(normalized.id);
      const data = await request(
        exists ? `/api/trips/${encodeURIComponent(normalized.id)}` : '/api/trips',
        {
          method: exists ? 'PUT' : 'POST',
          body: JSON.stringify(normalized),
          headers: exists && etag ? { 'If-Match': etag } : undefined,
          onResponse: (response) => rememberEtag(normalized.id, response),
        }
      );
      return remember(normalizeTrip(data || normalized));
    },

    async remove(id) {
      const safeId = requireId(id);
      const etag = etagsById.get(safeId);
      await request(`/api/trips/${encodeURIComponent(safeId)}`, {
        method: 'DELETE',
        headers: etag ? { 'If-Match': etag } : undefined,
      });
      persistedIds.delete(safeId);
      etagsById.delete(safeId);
    },
  };
}
