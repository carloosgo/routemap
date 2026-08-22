import {
  normalizeTrip,
  placeForPersistence,
} from '../trips/tripModel.js';

// Implementación de almacenamiento en el navegador (localStorage).
// Apta para uso individual / modo offline. Para multiusuario global se usa
// la implementación 'api' contra el backend.

function tripForPersistence(rawTrip) {
  const trip = normalizeTrip(rawTrip);
  return {
    ...trip,
    places: trip.places.map(placeForPersistence),
    routeConnections: trip.routeConnections.map((route) =>
      route.provider === 'google'
        ? {
            ...route,
            distance: 0,
            duration: 0,
            geometry: null,
            calculatedAt: '',
            transitSteps: [],
          }
        : route
    ),
  };
}

export function createLocalStorageRepository(storageKey) {
  const safeStorageKey = typeof storageKey === 'string' ? storageKey.trim() : '';
  if (!safeStorageKey) {
    throw new TypeError('Se requiere una clave de almacenamiento válida.');
  }

  function storage() {
    if (!globalThis.localStorage) {
      throw new Error('localStorage no está disponible en este entorno.');
    }
    return globalThis.localStorage;
  }

  function requireId(id) {
    if (typeof id !== 'string' || !id.trim()) {
      throw new TypeError('Se requiere un identificador de viaje válido.');
    }
    return id.trim();
  }

  function readAll() {
    try {
      const raw = storage().getItem(safeStorageKey);
      if (!raw) return [];
      const parsed = JSON.parse(raw);
      if (!Array.isArray(parsed)) return [];
      return parsed.map(normalizeTrip);
    } catch (error) {
      if (error instanceof SyntaxError) return [];
      throw error;
    }
  }

  function writeAll(trips) {
    storage().setItem(safeStorageKey, JSON.stringify(trips.map(tripForPersistence)));
  }

  return {
    async list() {
      return readAll().sort((a, b) => (b.updatedAt || '').localeCompare(a.updatedAt || ''));
    },

    async get(id) {
      const safeId = requireId(id);
      return readAll().find((trip) => trip.id === safeId) || null;
    },

    async save(trip) {
      const normalized = normalizeTrip(trip);
      const trips = readAll();
      const stamped = normalizeTrip({ ...normalized, updatedAt: new Date().toISOString() });
      const index = trips.findIndex((storedTrip) => storedTrip.id === stamped.id);
      if (index >= 0) trips[index] = stamped;
      else trips.push(stamped);
      writeAll(trips);
      return stamped;
    },

    async remove(id) {
      const safeId = requireId(id);
      writeAll(readAll().filter((trip) => trip.id !== safeId));
    },
  };
}
