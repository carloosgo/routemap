import { normalizeTrip } from '../trips/tripModel.js';

const REQUEST_TIMEOUT_MS = 15_000;

// Implementación contra backend REST (para multiusuario / escala global).
// Mismo contrato que el repositorio local. El backend de referencia está
// documentado en /server/README.md (FastAPI + PostgreSQL).
//
// Autenticación: cuando exista login, inyecta aquí el token (JWT) en los
// headers. NUNCA guardes secretos en el cliente; usa cookies httpOnly o
// el flujo de tu proveedor de auth (Auth0, Cognito, Firebase Auth).

export function createApiRepository(baseUrl) {
  const normalizedBaseUrl = (typeof baseUrl === 'string' ? baseUrl.trim() : '').replace(/\/+$/, '');
  const persistedIds = new Set();

  if (!normalizedBaseUrl) {
    console.warn('[storage] VITE_API_BASE_URL no configurada; el driver "api" fallará.');
  }

  function authHeaders() {
    // Placeholder: integra tu proveedor de auth.
    // const token = getAccessToken();
    // return token ? { Authorization: `Bearer ${token}` } : {};
    return {};
  }

  async function request(path, options = {}) {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

    try {
      const res = await fetch(`${normalizedBaseUrl}${path}`, {
        ...options,
        signal: controller.signal,
        headers: {
          Accept: 'application/json',
          'Content-Type': 'application/json',
          ...authHeaders(),
          ...(options.headers || {}),
        },
        credentials: 'include', // permite cookies de sesión httpOnly
      });

      if (!res.ok) {
        // No propagamos el cuerpo crudo del servidor al cliente: podría contener
        // detalles internos. El backend debe registrar el error completo.
        throw new Error(`No se pudo completar la solicitud (HTTP ${res.status}).`);
      }

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

  return {
    async list() {
      const data = await request('/api/trips');
      const trips = Array.isArray(data) ? data.map(normalizeTrip) : [];
      persistedIds.clear();
      trips.forEach(remember);
      return trips;
    },

    async get(id) {
      const safeId = requireId(id);
      const data = await request(`/api/trips/${encodeURIComponent(safeId)}`);
      return data ? remember(normalizeTrip(data)) : null;
    },

    async save(trip) {
      const exists = Boolean(trip?.id && persistedIds.has(trip.id));
      const data = await request(
        exists ? `/api/trips/${encodeURIComponent(trip.id)}` : '/api/trips',
        {
          method: exists ? 'PUT' : 'POST',
          body: JSON.stringify(trip),
        }
      );
      return remember(normalizeTrip(data || trip));
    },

    async remove(id) {
      const safeId = requireId(id);
      await request(`/api/trips/${encodeURIComponent(safeId)}`, { method: 'DELETE' });
      persistedIds.delete(safeId);
    },
  };
}
