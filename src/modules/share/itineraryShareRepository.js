import {
  collection,
  doc,
  getDoc,
  serverTimestamp,
  setDoc,
} from 'firebase/firestore';
import { getFirebaseServices } from '../../infrastructure/firebase/firebaseClient.js';

const SHARE_COLLECTION = 'itineraryShares';
const SHARE_SCHEMA_VERSION = 1;

function finiteNumber(value, fallback = 0) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function publicOrigin(origin) {
  if (!origin) return null;
  return {
    name: String(origin.name || '').slice(0, 120),
    country: String(origin.country || '').slice(0, 100),
    countryCode: String(origin.countryCode || '').slice(0, 2).toUpperCase(),
    departureDate: String(origin.departureDate || '').slice(0, 10),
    nights: Math.max(0, Math.round(finiteNumber(origin.nights))),
    total: Math.max(0, finiteNumber(origin.total)),
    lat: finiteNumber(origin.lat),
    lon: finiteNumber(origin.lon),
    note: String(origin.note || '').slice(0, 500),
    color: String(origin.color || '').slice(0, 16),
  };
}

function publicStop(stop, index) {
  return {
    number: Math.max(1, Math.round(finiteNumber(stop?.number, index + 1))),
    name: String(stop?.name || '').slice(0, 120),
    country: String(stop?.country || '').slice(0, 100),
    countryCode: String(stop?.countryCode || '').slice(0, 2).toUpperCase(),
    startDate: String(stop?.startDate || '').slice(0, 10),
    endDate: String(stop?.endDate || '').slice(0, 10),
    nights: Math.max(0, Math.round(finiteNumber(stop?.nights))),
    total: Math.max(0, finiteNumber(stop?.total)),
    lat: finiteNumber(stop?.lat),
    lon: finiteNumber(stop?.lon),
    note: String(stop?.note || '').slice(0, 500),
    color: String(stop?.color || '').slice(0, 16),
  };
}

export function buildPublicItineraryShareModel(model) {
  const stops = (Array.isArray(model?.stops) ? model.stops : []).slice(0, 500);
  return {
    name: String(model?.name || '').slice(0, 120),
    currency: String(model?.currency || 'MXN').slice(0, 3).toUpperCase(),
    hasOrigin: Boolean(model?.hasOrigin && model?.origin),
    origin: model?.hasOrigin && model?.origin ? publicOrigin(model.origin) : null,
    stops: stops.map(publicStop),
    summary: {
      startDate: String(model?.summary?.startDate || '').slice(0, 10),
      endDate: String(model?.summary?.endDate || '').slice(0, 10),
      countries: Math.max(0, Math.round(finiteNumber(model?.summary?.countries))),
      destinations: Math.max(0, Math.round(finiteNumber(model?.summary?.destinations))),
      nights: Math.max(0, Math.round(finiteNumber(model?.summary?.nights))),
    },
    total: Math.max(0, finiteNumber(model?.total)),
  };
}

export async function createItineraryShare(model, { intlLocale = 'es-MX' } = {}) {
  const { auth, db } = getFirebaseServices();
  const ownerId = auth.currentUser?.uid;
  if (!ownerId) {
    const error = new Error('Authentication is required to share an itinerary');
    error.code = 'itinerary-share/auth-required';
    throw error;
  }

  const shareRef = doc(collection(db, SHARE_COLLECTION));
  await setDoc(shareRef, {
    schemaVersion: SHARE_SCHEMA_VERSION,
    ownerId,
    intlLocale: String(intlLocale || 'es-MX').slice(0, 16),
    model: buildPublicItineraryShareModel(model),
    createdAt: serverTimestamp(),
  });
  return shareRef.id;
}

export async function loadItineraryShare(shareId) {
  const id = String(shareId || '').trim();
  if (!id || id.length > 128) return null;
  const { db } = getFirebaseServices();
  const snapshot = await getDoc(doc(db, SHARE_COLLECTION, id));
  if (!snapshot.exists()) return null;
  const data = snapshot.data();
  if (data?.schemaVersion !== SHARE_SCHEMA_VERSION || !data?.model) return null;
  return {
    intlLocale: String(data.intlLocale || 'es-MX'),
    model: data.model,
  };
}
