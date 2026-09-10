import { useEffect, useRef, useState } from 'react';
import { loadGooglePlacePhoto } from './googlePlacePhotoClient.js';

const hostStyle = Object.freeze({
  display: 'inline-flex',
  width: '72px',
  minWidth: '72px',
  minHeight: '62px',
  flexDirection: 'column',
  justifyContent: 'center',
});

const linkStyle = Object.freeze({
  display: 'inline-flex',
  width: '72px',
  flexDirection: 'column',
  gap: '2px',
  color: 'inherit',
  textDecoration: 'none',
});

const imageStyle = Object.freeze({
  display: 'block',
  width: '72px',
  height: '48px',
  border: '1px solid #dde3ea',
  borderRadius: '6px',
  background: '#eef2f5',
  objectFit: 'cover',
});

const attributionStyle = Object.freeze({
  color: '#5e5e5e',
  fontFamily: 'Arial, sans-serif',
  fontSize: '12px',
  fontStyle: 'normal',
  fontWeight: 400,
  lineHeight: 1,
  whiteSpace: 'nowrap',
});

const skeletonStyle = Object.freeze({
  display: 'block',
  width: '72px',
  height: '48px',
  border: '1px solid #e2e8f0',
  borderRadius: '6px',
  background: '#f1f5f9',
});

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
    <span ref={hostRef} style={hostStyle}>
      {photo?.uri ? (
        <a
          href={photo.googleMapsUri || undefined}
          target={photo.googleMapsUri ? '_blank' : undefined}
          rel={photo.googleMapsUri ? 'noreferrer' : undefined}
          aria-label="Google Maps"
          style={linkStyle}
        >
          <img
            src={photo.uri}
            width="72"
            height="48"
            alt=""
            loading="lazy"
            decoding="async"
            onError={() => setFailed(true)}
            style={imageStyle}
          />
          <span translate="no" style={attributionStyle}>Google Maps</span>
        </a>
      ) : (
        <span aria-hidden="true" style={skeletonStyle} />
      )}
    </span>
  );
}
