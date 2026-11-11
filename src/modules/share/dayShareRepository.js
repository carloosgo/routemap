import {
  collection,
  doc,
  getDoc,
  serverTimestamp,
  setDoc,
} from 'firebase/firestore';
import { getFirebaseServices } from '../../infrastructure/firebase/firebaseClient.js';

const DAY_SHARE_COLLECTION = 'dayShares';
const DAY_SHARE_SCHEMA_VERSION = 1;

export function dayShareUrl(shareId, origin = globalThis.location?.origin) {
  return new URL(`/share/dia/${encodeURIComponent(shareId)}`, origin).toString();
}

/** Guarda la copia pública del día y devuelve su id (link corto). */
export async function createDayShare(model, { intlLocale = 'es-MX' } = {}) {
  const { auth, db } = getFirebaseServices();
  const ownerId = auth.currentUser?.uid;
  if (!ownerId) {
    const error = new Error('Authentication is required to share a day');
    error.code = 'day-share/auth-required';
    throw error;
  }
  const shareRef = doc(collection(db, DAY_SHARE_COLLECTION));
  await setDoc(shareRef, {
    schemaVersion: DAY_SHARE_SCHEMA_VERSION,
    ownerId,
    intlLocale: String(intlLocale || '').toLowerCase().startsWith('en') ? 'en-US' : 'es-MX',
    model,
    createdAt: serverTimestamp(),
  });
  return shareRef.id;
}

export async function loadDayShare(shareId) {
  const id = String(shareId || '').trim();
  if (!id || id.length > 128) return null;
  const { db } = getFirebaseServices();
  const snapshot = await getDoc(doc(db, DAY_SHARE_COLLECTION, id));
  if (!snapshot.exists()) return null;
  const data = snapshot.data();
  if (data?.schemaVersion !== DAY_SHARE_SCHEMA_VERSION || !data?.model) return null;
  return {
    intlLocale: String(data.intlLocale || 'es-MX'),
    model: data.model,
  };
}
