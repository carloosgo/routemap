import { normalizeTrip } from '../trips/tripModel.js';

// Implementación contra backend REST (para multiusuario / escala global).
// Mismo contrato que el repositorio local. El backend de referencia está
// documentado en /server/README.md (FastAPI + PostgreSQL).
//
// Autenticación: cuando exista login, inyecta aquí el token (JWT) en los
// headers. NUNCA guardes secretos en el cliente; usa cookies httpOnly o
// el flujo de tu proveedor de auth (Auth0, Cognito, Firebase Auth).

export function createApiRepository(baseUrl) {
  if (!baseUrl) {
    console.warn('[storage] VITE_API_BASE_URL no configurada; el driver "api" fallará.');
  }

  function authHeaders() {
    // Placeholder: integra tu proveedor de auth.
    // const token = getAccessToken();
    // return token ? { Authorization: `Bearer ${token}` } : {};
    return {};
  }

  async function request(path, options = {}) {
    const res = await fetch(`${baseUrl}${path}`, {
      ...options,
      headers: {
        'Content-Type': 'application/json',
        ...authHeaders(),
        ...(options.headers || {}),
      },
      credentials: 'include', // permite cookies de sesión httpOnly
    });
    if (!res.ok) {
      const body = await res.text().catch(() => '');
      throw new Error(`API ${res.status}: ${body}`);
    }
    if (res.status === 204) return null;
    return res.json();
  }

  return {
    async list() {
      const data = await request('/api/trips');
      return Array.isArray(data) ? data.map(normalizeTrip) : [];
    },

    async get(id) {
      const data = await request(`/api/trips/${encodeURIComponent(id)}`);
      return data ? normalizeTrip(data) : null;
    },

    async save(trip) {
      const exists = Boolean(trip.id);
      const data = await request(
        exists ? `/api/trips/${encodeURIComponent(trip.id)}` : '/api/trips',
        {
          method: exists ? 'PUT' : 'POST',
          body: JSON.stringify(trip),
        }
      );
      return normalizeTrip(data);
    },

    async remove(id) {
      await request(`/api/trips/${encodeURIComponent(id)}`, { method: 'DELETE' });
    },
  };
}
