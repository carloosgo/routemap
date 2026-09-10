import { useEffect, useRef, useState } from 'react';
import { loadGooglePlacePhoto } from './googlePlacePhotoClient.js';

export function PlacePhotoThumbnail({ place }) {
  const hostRef = useRef(null);
  const placeId = String(place?.googlePlaceId || '').trim();
  const [shouldLoad, setShouldLoad] = useState(false);
  const [photo, setPhoto] = useState(null);
  const [resolved, setResolved] = useState(false);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    setShouldLoad(false);
    setPhoto(null);
    setResolved(false);
    setFailed(false);
  }, [placeId]);

  useEffect(() => {
    const node = hostRef.current;
    if (!placeId || !node || shouldLoad) return undefined;
    const Observer = globalThis.IntersectionObserver;
    if (typeof Observer !== 'function') {
      setShouldLoad(true);
      return undefined;
    }

    const observer = new Observer((entries) => {
      if (!entries.some((entry) => entry.isIntersecting)) return;
      setShouldLoad(true);
      observer.disconnect();
    }, { rootMargin: '160px 0px' });
    observer.observe(node);
    return () => observer.disconnect();
  }, [placeId, shouldLoad]);

  useEffect(() => {
    if (!placeId || !shouldLoad) return undefined;
    const controller = new AbortController();
    loadGooglePlacePhoto(placeId, { signal: controller.signal })
      .then((nextPhoto) => {
        if (controller.signal.aborted) return;
        setPhoto(nextPhoto);
        setResolved(true);
      })
      .catch((error) => {
        if (error?.name !== 'AbortError') {
          setPhoto(null);
          setResolved(true);
        }
      });
    return () => controller.abort();
  }, [placeId, shouldLoad]);

  if (!placeId || failed || (resolved && !photo)) return null;

  return (
    <span className="trip-day-first-place__photo" ref={hostRef}>
      {photo?.uri ? (
        <a
          className="trip-day-first-place__photo-link"
          href={photo.googleMapsUri || undefined}
          target={photo.googleMapsUri ? '_blank' : undefined}
          rel={photo.googleMapsUri ? 'noreferrer' : undefined}
          aria-label="Google Maps"
        >
          <img
            src={photo.uri}
            width="72"
            height="48"
            alt=""
            loading="lazy"
            decoding="async"
            onError={() => setFailed(true)}
          />
          <span className="trip-day-first-place__photo-attribution" translate="no">
            Google Maps
          </span>
        </a>
      ) : (
        <span className="trip-day-first-place__photo-skeleton" aria-hidden="true" />
      )}
    </span>
  );
}
