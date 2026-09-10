import { useEffect, useMemo, useRef, useState } from 'react';
import { googleStreetViewThumbnailUrl } from './googleStreetViewThumbnail.js';

export function StreetViewThumbnail({ place }) {
  const hostRef = useRef(null);
  const [shouldLoad, setShouldLoad] = useState(false);
  const [failed, setFailed] = useState(false);
  const url = useMemo(() => googleStreetViewThumbnailUrl(place), [place]);

  useEffect(() => {
    setShouldLoad(false);
    setFailed(false);
  }, [url]);

  useEffect(() => {
    const node = hostRef.current;
    if (!url || !node || shouldLoad) return undefined;
    if (typeof IntersectionObserver !== 'function') {
      setShouldLoad(true);
      return undefined;
    }

    const observer = new IntersectionObserver((entries) => {
      if (!entries.some((entry) => entry.isIntersecting)) return;
      setShouldLoad(true);
      observer.disconnect();
    }, { rootMargin: '160px 0px' });
    observer.observe(node);
    return () => observer.disconnect();
  }, [shouldLoad, url]);

  if (!url || failed) return null;

  return (
    <span className="trip-day-first-place__streetview" ref={hostRef}>
      {shouldLoad && (
        <>
          <img
            src={url}
            width="96"
            height="64"
            alt=""
            loading="lazy"
            decoding="async"
            onError={() => setFailed(true)}
          />
          <span className="trip-day-first-place__streetview-attribution" translate="no">
            Google Maps
          </span>
        </>
      )}
    </span>
  );
}
