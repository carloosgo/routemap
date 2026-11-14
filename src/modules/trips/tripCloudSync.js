import { createSegment, normalizeTrip, placeForPersistence } from './tripModel.js';
import { openSavedTrip } from './savedTripOperations.js';

/**
 * Reglas para que web y app (PWA) muestren el mismo viaje guardado.
 *
 * Cada dispositivo guarda un borrador local (IndexedDB) mientras se edita.
 * Ese borrador solo debe ganarle a la nube cuando contiene cambios de ESTE
 * dispositivo que todavía no subieron. Si ya está todo sincronizado, el
 * borrador es una copia vieja: la versión de la nube puede traer cambios
 * hechos en otro dispositivo (rutas "Elegir cómo llegar", días, lugares,
 * notas) y es la que se muestra.
 */

/**
 * true si el dispositivo tiene cambios locales del viaje sin subir: en la cola
 * de sincronización o, si se pasa el borrador, cambios que ni siquiera
 * llegaron a la cola (por ejemplo, editados sin internet). El borrador se
 * compara con la última versión de la nube que conoce ESTE dispositivo, antes
 * de descargar la nueva; así una copia vieja no se confunde con cambios.
 */
export async function tripHasUnsyncedLocalChanges(repository, tripId, draft = null) {
  // Sin repositorio remoto (sin sesión) el borrador local es la única copia.
  if (typeof repository?.getPersistenceState !== 'function') return true;
  try {
    const state = await repository.getPersistenceState(tripId);
    if (state?.supported !== true) return true;
    if (!(state.state === 'saved' && !(Number(state.pending) > 0))) return true;
    if (!draft || typeof repository.localChangeCount !== 'function') return false;
    const changes = await repository.localChangeCount(draft);
    // null: el dispositivo no conoce la nube de este viaje; se conserva.
    return changes == null || changes > 0;
  } catch {
    // Ante la duda se conserva el trabajo local.
    return true;
  }
}

/**
 * Abre un viaje: la nube, salvo que el borrador de este dispositivo tenga
 * cambios sin subir. Se decide ANTES de descargar, porque abrir desde la nube
 * actualiza la base local con la que se compara.
 */
export async function openTripPreferringCloud({ repository, draftStore, tripId }) {
  const draft = await draftStore.get(tripId);
  if (draft && await tripHasUnsyncedLocalChanges(repository, tripId, draft)) return draft;
  const storedTrip = await openSavedTrip(repository, tripId);
  if (!storedTrip) return draft || null;
  if (draft) await draftStore.delete(tripId).catch(() => {});
  return storedTrip;
}

/**
 * Versión de la nube del viaje abierto, solo si este dispositivo no tiene
 * cambios sin subir. Devuelve { trip, accept } o null: accept() adopta la nube
 * como base local y se llama justo antes de mostrarla, nunca si se descarta
 * (si no, un cambio local hecho mientras tanto podría borrar lo del otro equipo).
 */
export async function cloudTripUpdate(repository, tripId) {
  if (!tripId || typeof repository?.fetchRemote !== 'function') return null;
  if (await tripHasUnsyncedLocalChanges(repository, tripId)) return null;
  const fetched = await repository.fetchRemote(tripId);
  if (!fetched?.trip || await tripHasUnsyncedLocalChanges(repository, tripId)) return null;
  return fetched;
}

function hasNoteContent(note) {
  return Boolean(String(note?.title || '').trim() || String(note?.text || '').trim());
}

/**
 * Huella de lo que se guarda en la nube. Ignora fechas de edición, datos de
 * ruta calculados en sesión (duración, geometría) y la nota vacía que se crea
 * sola, para comparar dos versiones sin falsos cambios.
 */
export function tripCloudFingerprint(rawTrip) {
  if (!rawTrip) return '';
  const trip = normalizeTrip(rawTrip);
  return JSON.stringify({
    id: trip.id,
    name: trip.name,
    currency: trip.currency,
    origin: trip.origin,
    originDetails: trip.originDetails,
    segments: trip.segments.map(createSegment),
    places: trip.places.map(placeForPersistence),
    routeConnections: trip.routeConnections.map((route) => ({
      fromPlaceId: route.fromPlaceId,
      toPlaceId: route.toPlaceId,
      mode: route.mode,
      visible: route.visible,
    })),
    notes: trip.notes.filter(hasNoteContent).map(({ title, text }) => ({ title, text })),
    checklist: trip.checklist.map(({ text, done }) => ({ text, done })),
  });
}

export function tripsDifferInCloudData(left, right) {
  return tripCloudFingerprint(left) !== tripCloudFingerprint(right);
}
