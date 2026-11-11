import {
  collection,
  doc,
  getDoc,
  onSnapshot,
  serverTimestamp,
  setDoc,
  updateDoc,
} from 'firebase/firestore';
import { getFirebaseServices } from '../../infrastructure/firebase/firebaseClient.js';

const DAY_SHARE_COLLECTION = 'dayShares';
const DAY_SHARE_SCHEMA_VERSION = 1;

export function dayShareUrl(shareId, origin = globalThis.location?.origin) {
  return new URL(`/share/dia/${encodeURIComponent(shareId)}`, origin).toString();
}

function normalizedLocale(intlLocale) {
  return String(intlLocale || '').toLowerCase().startsWith('en') ? 'en-US' : 'es-MX';
}

function currentOwnerId() {
  const { auth } = getFirebaseServices();
  const ownerId = auth.currentUser?.uid;
  if (!ownerId) {
    const error = new Error('Authentication is required to share a day');
    error.code = 'day-share/auth-required';
    throw error;
  }
  return ownerId;
}

/**
 * Id estable del día compartido: el mismo viaje y fecha siempre dan el mismo
 * link, así el link sigue mostrando los cambios recientes del día.
 */
export async function stableDayShareId(ownerId, tripId, date) {
  if (!ownerId || !tripId || !date || !globalThis.crypto?.subtle) return '';
  const bytes = new globalThis.TextEncoder().encode(`atlas-day:${ownerId}:${tripId}:${date}`);
  const digest = new Uint8Array(await globalThis.crypto.subtle.digest('SHA-256', bytes));
  return Array.from(digest.slice(0, 12), (byte) => byte.toString(16).padStart(2, '0')).join('');
}

async function shareRef({ tripId, date } = {}) {
  const { db } = getFirebaseServices();
  const ownerId = currentOwnerId();
  const stableId = await stableDayShareId(ownerId, tripId, date);
  return {
    ownerId,
    ref: stableId ? doc(db, DAY_SHARE_COLLECTION, stableId) : doc(collection(db, DAY_SHARE_COLLECTION)),
  };
}

/**
 * Publica la copia pública del día (la crea o la actualiza) y devuelve su id.
 */
export async function publishDayShare(model, { tripId, date, intlLocale = 'es-MX' } = {}) {
  const { ownerId, ref } = await shareRef({ tripId, date });
  const snapshot = await getDoc(ref);
  if (snapshot.exists()) {
    await updateDoc(ref, { model, intlLocale: normalizedLocale(intlLocale) });
  } else {
    await setDoc(ref, {
      schemaVersion: DAY_SHARE_SCHEMA_VERSION,
      ownerId,
      intlLocale: normalizedLocale(intlLocale),
      model,
      createdAt: serverTimestamp(),
    });
  }
  return ref.id;
}

/**
 * Si el día ya se compartió, actualiza su copia pública con los cambios.
 * Devuelve true si había un link que actualizar.
 */
export async function syncDayShareIfShared(model, { tripId, date, intlLocale = 'es-MX' } = {}) {
  if (!tripId || !date) return false;
  const { ref } = await shareRef({ tripId, date });
  const snapshot = await getDoc(ref);
  if (!snapshot.exists()) return false;
  if (JSON.stringify(snapshot.data()?.model) === JSON.stringify(model)) return true;
  await updateDoc(ref, { model, intlLocale: normalizedLocale(intlLocale) });
  return true;
}

function shareFromSnapshot(snapshot) {
  if (!snapshot.exists()) return null;
  const data = snapshot.data();
  if (data?.schemaVersion !== DAY_SHARE_SCHEMA_VERSION || !data?.model) return null;
  return {
    intlLocale: String(data.intlLocale || 'es-MX'),
    model: data.model,
  };
}

export async function loadDayShare(shareId) {
  const id = String(shareId || '').trim();
  if (!id || id.length > 128) return null;
  const { db } = getFirebaseServices();
  return shareFromSnapshot(await getDoc(doc(db, DAY_SHARE_COLLECTION, id)));
}

/** Escucha el día compartido en vivo: la vista pública se actualiza sola. */
export function watchDayShare(shareId, onChange, onError) {
  const id = String(shareId || '').trim();
  if (!id || id.length > 128) {
    onChange(null);
    return () => {};
  }
  const { db } = getFirebaseServices();
  return onSnapshot(
    doc(db, DAY_SHARE_COLLECTION, id),
    (snapshot) => onChange(shareFromSnapshot(snapshot)),
    onError
  );
}
