import { useEffect, useMemo, useRef, useState } from 'react';
import { cityLandmarkGlyph } from './cityLandmarkGlyphs.js';
import { loadGooglePlacePhoto } from '../places/googlePlacePhotoClient.js';
import { searchGooglePlaces } from '../places/googlePlacesClient.js';

const cityPhotoCache = new Map();
const pendingCityPhotos = new Map();

const VISUAL_STYLE = Object.freeze({
  '--city-visual-accent': '#475467',
  position: 'absolute',
  inset: 0,
  display: 'grid',
  placeItems: 'center',
  overflow: 'hidden',
  borderRadius: 'inherit',
  background: 'var(--city-visual-accent)',
  color: '#ffffff',
});

const GLYPH_STYLE = Object.freeze({
  width: '46px',
  height: '46px',
  transform: 'translateY(3px)',
  pointerEvents: 'none',
});

/** Silueta del lugar emblemático de la ciudad, en blanco sobre su color de parada. */
function VisualIcon({ kind }) {
  return (
    <svg viewBox="0 0 24 24" style={GLYPH_STYLE} aria-hidden="true">
      {cityLandmarkGlyph(kind).map((shape, index) => {
        if (typeof shape === 'string') return <path key={index} d={shape} fill="currentColor" fillRule="evenodd" />;
        if (shape.line) {
          return <path key={index} d={shape.line} fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />;
        }
        return <circle key={index} cx={shape.cx} cy={shape.cy} r={shape.r} fill="currentColor" />;
      })}
    </svg>
  );
}

function normalizeCityName(value) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim()
    .toLowerCase();
}

function cityPhotoKey(city) {
  const id = String(city?.id || '').trim();
  if (id) return id;
  return [city?.name, city?.countryCode, city?.lat, city?.lon]
    .map((value) => String(value ?? '').trim())
    .join('|');
}

function cityPhotoQuery(city) {
  return [city?.name, city?.country, 'landmark']
    .map((value) => String(value || '').trim())
    .filter(Boolean)
    .join(', ')
    .slice(0, 120);
}

function geoDistanceScore(place, city) {
  const placeLat = Number(place?.lat);
  const placeLon = Number(place?.lon);
  const cityLat = Number(city?.lat);
  const cityLon = Number(city?.lon);
  if (![placeLat, placeLon, cityLat, cityLon].every(Number.isFinite)) return Number.POSITIVE_INFINITY;
  const latDelta = placeLat - cityLat;
  const lonDelta = placeLon - cityLon;
  return (latDelta * latDelta) + (lonDelta * lonDelta);
}

async function resolveCityPhoto(city) {
  const key = cityPhotoKey(city);
  if (!key || !city?.name) return null;
  if (cityPhotoCache.has(key)) return cityPhotoCache.get(key);
  if (pendingCityPhotos.has(key)) return pendingCityPhotos.get(key);

  const pending = (async () => {
    try {
      const results = await searchGooglePlaces(cityPhotoQuery(city));
      const candidate = [...results]
        .filter((place) => String(place?.googlePlaceId || '').trim())
        .sort((left, right) => geoDistanceScore(left, city) - geoDistanceScore(right, city))[0];
      if (!candidate?.googlePlaceId) return null;
      return await loadGooglePlacePhoto(candidate.googlePlaceId);
    } catch {
      return null;
    }
  })();

  pendingCityPhotos.set(key, pending);
  try {
    const photo = await pending;
    if (cityPhotoCache.size >= 80) cityPhotoCache.delete(cityPhotoCache.keys().next().value);
    cityPhotoCache.set(key, photo);
    return photo;
  } finally {
    pendingCityPhotos.delete(key);
  }
}

export function itineraryCityVisualKind(city) {
  const name = normalizeCityName(city?.name || city?.displayName);
  if (!name) return 'generic';
  if (name.includes('mexico city') || name.includes('ciudad de mexico') || name.includes('cdmx')) return 'metropolis';
  if (name.includes('paris')) return 'paris';
  if (name.includes('amsterdam')) return 'amsterdam';
  if (name.includes('bruges') || name.includes('brujas')) return 'bruges';
  if (name.includes('ghent') || name.includes('gante')) return 'ghent';
  if (name.includes('brussels') || name.includes('bruselas')) return 'brussels';
  if (name.includes('cologne') || name.includes('koln') || name.includes('colonia')) return 'cologne';
  if (name.includes('berlin')) return 'berlin';
  if (name.includes('munich') || name.includes('munchen')) return 'munich';
  if (name.includes('nuremberg') || name.includes('nurnberg')) return 'nuremberg';
  if (name.includes('bamberg')) return 'bamberg';
  if (name.includes('rothenburg')) return 'rothenburg';
  if (name.includes('london') || name.includes('londres')) return 'london';
  if (name.includes('madrid')) return 'madrid';
  if (name.includes('barcelona')) return 'barcelona';
  if (name.includes('rome') || name.includes('roma')) return 'rome';
  if (name.includes('venice') || name.includes('venecia') || name.includes('venezia')) return 'venice';
  if (name.includes('prague') || name.includes('praga') || name.includes('praha')) return 'prague';
  if (name.includes('vienna') || name.includes('viena') || name.includes('wien')) return 'vienna';
  if (name.includes('frankfurt')) return 'frankfurt';
  return 'generic';
}


export function ItineraryCityVisual({ city, accent }) {
  const hostRef = useRef(null);
  const kind = itineraryCityVisualKind(city);
  const [shouldLoad, setShouldLoad] = useState(false);
  const [photo, setPhoto] = useState(null);
  const [photoFailed, setPhotoFailed] = useState(false);
  const key = cityPhotoKey(city);
  const hasCity = Boolean(String(city?.name || '').trim());
  const visualStyle = useMemo(() => {
    // Tarjeta aún vacía: miniatura neutra con la silueta genérica en gris.
    if (!hasCity) return { ...VISUAL_STYLE, background: '#eef1f3', color: '#b4bcc4' };
    return accent ? { ...VISUAL_STYLE, '--city-visual-accent': accent } : VISUAL_STYLE;
  }, [accent, hasCity]);

  useEffect(() => {
    setShouldLoad(false);
    setPhoto(cityPhotoCache.get(key) || null);
    setPhotoFailed(false);
  }, [key]);

  useEffect(() => {
    const node = hostRef.current;
    if (!city?.name || !node || shouldLoad || cityPhotoCache.has(key)) return undefined;
    const Observer = globalThis.IntersectionObserver;
    if (typeof Observer !== 'function') {
      setShouldLoad(true);
      return undefined;
    }
    const observer = new Observer((entries) => {
      if (!entries.some((entry) => entry.isIntersecting)) return;
      setShouldLoad(true);
      observer.disconnect();
    }, { rootMargin: '180px 0px' });
    observer.observe(node);
    return () => observer.disconnect();
  }, [city?.name, key, shouldLoad]);

  useEffect(() => {
    if (!city?.name || !shouldLoad || cityPhotoCache.has(key)) return undefined;
    let active = true;
    resolveCityPhoto(city).then((resolvedPhoto) => {
      if (active) setPhoto(resolvedPhoto);
    });
    return () => {
      active = false;
    };
  }, [city, key, shouldLoad]);

  const showPhoto = Boolean(photo?.uri) && !photoFailed;

  return (
    <span
      ref={hostRef}
      className="itinerary-card-city-icon"
      data-city-visual={kind}
      style={visualStyle}
      aria-hidden="true"
    >
      {showPhoto ? (
        <a
          className="itinerary-card-city-photo-link"
          href={photo.googleMapsUri || undefined}
          target={photo.googleMapsUri ? '_blank' : undefined}
          rel={photo.googleMapsUri ? 'noreferrer' : undefined}
          tabIndex={-1}
        >
          <img
            className="itinerary-card-city-photo"
            src={photo.uri}
            alt=""
            loading="lazy"
            decoding="async"
            referrerPolicy="no-referrer"
            onError={() => setPhotoFailed(true)}
          />
        </a>
      ) : (
        <VisualIcon kind={hasCity ? kind : 'generic'} />
      )}
    </span>
  );
}
