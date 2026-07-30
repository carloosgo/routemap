import { normalizeTrip } from '../trips/tripModel.js';

const REQUEST_TIMEOUT_MS = 15_000;

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

      if (!res.ok) {
        throw new Error(`No se pudo completar la solicitud (HTTP ${res.status}).`);
      }

      onResponse?.(res);
      if (res.status === 204) return null;

      try {
        return await res.json();
      } catch {
        throw new Error('El servidor devolvió una respuesta inválida.');
      }
    } catch (error) {
      if (error?.name === 'AbortError') {
        throw new Error('La solicitud tardó demasiado y fue cancelada.');
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
