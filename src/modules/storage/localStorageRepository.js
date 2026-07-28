import { normalizeTrip } from '../trips/tripModel.js';

// Implementación de almacenamiento en el navegador (localStorage).
// Apta para uso individual / modo offline. Para multiusuario global se usa
// la implementación 'api' contra el backend.

export function createLocalStorageRepository(storageKey) {
  function readAll() {
    try {
      const raw = localStorage.getItem(storageKey);
      if (!raw) return [];
      const parsed = JSON.parse(raw);
      if (!Array.isArray(parsed)) return [];
      return parsed.map(normalizeTrip);
    } catch {
      return [];
    }
  }

  function writeAll(trips) {
    localStorage.setItem(storageKey, JSON.stringify(trips));
  }

  return {
    async list() {
      return readAll().sort((a, b) => (b.updatedAt || '').localeCompare(a.updatedAt || ''));
    },

    async get(id) {
      return readAll().find((t) => t.id === id) || null;
    },

    async save(trip) {
      const trips = readAll();
      const stamped = { ...trip, updatedAt: new Date().toISOString() };
      const idx = trips.findIndex((t) => t.id === trip.id);
      if (idx >= 0) trips[idx] = stamped;
      else trips.push(stamped);
      writeAll(trips);
      return stamped;
    },

    async remove(id) {
      writeAll(readAll().filter((t) => t.id !== id));
    },
  };
}
