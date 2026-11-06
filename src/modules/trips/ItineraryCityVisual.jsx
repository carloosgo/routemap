import { useEffect, useMemo, useRef, useState } from 'react';
import { cityTypeFor, cityTypeIcon } from './cityTypeIcons.js';
import { loadGooglePlacePhoto } from '../places/googlePlacePhotoClient.js';
import { searchGooglePlaces } from '../places/googlePlacesClient.js';

const cityPhotoCache = new Map();
const pendingCityPhotos = new Map();

// Tres tonos del color de la parada para los iconos propios por tipo de ciudad.
const VISUAL_STYLE = Object.freeze({
  '--city-visual-accent': '#475467',
  '--city-icon-mid': 'var(--city-visual-accent)',
  '--city-icon-deep': 'color-mix(in srgb, var(--city-visual-accent) 62%, #0b1f2c)',
  '--city-icon-soft': 'color-mix(in srgb, var(--city-visual-accent) 42%, #ffffff)',
  '--city-icon-white': '#ffffff',
  position: 'absolute',
  inset: 0,
  display: 'grid',
  placeItems: 'center',
  overflow: 'hidden',
  borderRadius: 'inherit',
  background: 'color-mix(in srgb, var(--city-visual-accent) 13%, #ffffff)',
});

const ICON_STYLE = Object.freeze({
  width: '78%',
  height: '78%',
  transform: 'translateY(4%)',
  pointerEvents: 'none',
});

/** Icono propio de Atlas según el tipo de ciudad (costa, montaña, canales…). */
function VisualIcon({ type }) {
  return (
    <svg viewBox="0 0 48 48" style={ICON_STYLE} aria-hidden="true">
      {cityTypeIcon(type).map((shape, index) => (
        shape.tone === 'wave'
          ? <path key={index} d={shape.d} fill="none" stroke="var(--city-icon-white)" strokeWidth="1.6" strokeLinecap="round" />
          : <path key={index} d={shape.d} fill={`var(--city-icon-${shape.tone})`} fillRule="evenodd" />
      ))}
    </svg>
  );
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



export function ItineraryCityVisual({ city, accent }) {
  const hostRef = useRef(null);
  const type = cityTypeFor(city);
  const [shouldLoad, setShouldLoad] = useState(false);
  const [photo, setPhoto] = useState(null);
  const [photoFailed, setPhotoFailed] = useState(false);
  const key = cityPhotoKey(city);
  const hasCity = Boolean(String(city?.name || '').trim());
  const visualStyle = useMemo(() => {
    // Tarjeta aún vacía: miniatura neutra en gris.
    if (!hasCity) return { ...VISUAL_STYLE, '--city-visual-accent': '#98a2b3' };
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
      data-city-visual={type}
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
        <VisualIcon type={type} />
      )}
    </span>
  );
}
