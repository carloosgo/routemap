import { normalizeTrip } from '../trips/tripModel.js';

// Implementación contra backend REST (para multiusuario / escala global).
// Mismo contrato que el repositorio local. El backend de referencia está
// documentado en /server/README.md (FastAPI + PostgreSQL).
//
// Autenticación: cuando exista login, inyecta aquí el token (JWT) en los
// headers. NUNCA guardes secretos en el cliente; usa cookies httpOnly o
// el flujo de tu proveedor de auth (Auth0, Cognito, Firebase Auth).

export function createApiRepository(baseUrl) {
  const normalizedBaseUrl = (baseUrl || '').replace(/\/+$/, '');
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
    const res = await fetch(`${normalizedBaseUrl}${path}`, {
      ...options,
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
    return res.json();
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
      const data = await request(`/api/trips/${encodeURIComponent(id)}`);
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
      await request(`/api/trips/${encodeURIComponent(id)}`, { method: 'DELETE' });
      persistedIds.delete(id);
    },
  };
}
