import { IconArrowRight, IconCheck, IconX } from '@tabler/icons-react';
import { RouteMap } from '../modules/map/RouteMap.jsx';
import { flagImageUrl } from '../modules/flags/flags.js';
import { colorForIndex } from '../config.js';

export function AppMapPane({
  trip,
  openNoteSegmentId,
  setOpenNoteSegmentId,
  updateSegment,
  stops,
  toast,
  t,
}) {
  return (
    <section className="mappane" aria-label={t('mapRegion')}>
      <RouteMap segments={trip.segments} />
      {openNoteSegmentId && (
        <div
          aria-hidden="true"
          style={{ position: 'absolute', inset: 0, zIndex: 10, background: 'transparent' }}
          onPointerDown={(event) => {
            event.preventDefault();
            event.stopPropagation();
          }}
          onPointerUp={(event) => {
            event.preventDefault();
            event.stopPropagation();
            setOpenNoteSegmentId(null);
          }}
        />
      )}
      {openNoteSegmentId && (() => {
        const segment = trip.segments.find((item) => item.id === openNoteSegmentId);
        if (!segment) return null;
        const index = trip.segments.findIndex((item) => item.id === openNoteSegmentId);
        const originName = segment.origin?.name || t('origin');
        const destinationName = segment.destination?.name || t('destination');
        return (
          <div
            className="segnote"
            role="dialog"
            aria-label={t('segmentNote')}
            style={{ zIndex: 11 }}
          >
            <div className="segnote__head">
              <span
                className="segnote__badge"
                style={{ background: colorForIndex(index) }}
              >
                {index + 1}
              </span>
              <span className="segnote__title">
                {originName}
                <IconArrowRight size={11} aria-hidden="true" />
                {destinationName}
              </span>
              <button
                type="button"
                className="segnote__x"
                aria-label={t('closeNote')}
                onClick={() => setOpenNoteSegmentId(null)}
              >
                <IconX size={16} aria-hidden="true" />
              </button>
            </div>
            <textarea
              className="segnote__textarea"
              maxLength={500}
              aria-label={t('segmentNote')}
              placeholder={t('segmentNotePlaceholder')}
              value={segment.note || ''}
              onChange={(event) => updateSegment(segment.id, { note: event.target.value })}
              autoFocus
            />
            <div className="segnote__foot">
              <span className="segnote__saved">
                <IconCheck size={12} aria-hidden="true" /> {t('savedShort')}
              </span>
              <span className="segnote__count">{(segment.note || '').length} / 500</span>
            </div>
          </div>
        );
      })()}
      {stops.length > 0 && (
        <div className="routestrip" role="list" aria-label={t('routeSummary')}>
          {stops.map((city, index) => (
            <span
              className="routestrip__item"
              role="listitem"
              key={`${city.lat}-${city.lon}-${index}`}
            >
              {city.countryCode ? (
                <img
                  className="flag"
                  src={flagImageUrl(city.countryCode, 20)}
                  alt={city.countryCode}
                  width={20}
                  height={14}
                  loading="lazy"
                />
              ) : (
                <span className="flag flag--empty" />
              )}
              {index < stops.length - 1 && (
                <IconArrowRight size={12} className="routestrip__arrow" aria-hidden="true" />
              )}
            </span>
          ))}
        </div>
      )}
      {toast && (
        <div className="toast" role="status" aria-live="polite">
          {toast}
        </div>
      )}
    </section>
  );
}
