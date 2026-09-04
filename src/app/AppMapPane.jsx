import { IconArrowRight, IconCheck, IconX } from '@tabler/icons-react';
import { RouteMap } from '../modules/map/RouteMap.jsx';
import { ItineraryDetailsModal } from '../modules/trips/ItineraryDetailsModal.jsx';
import { buildItineraryStopSequence } from '../modules/trips/itineraryStopSequence.js';
import { ORIGIN_NOTE_TARGET } from '../modules/trips/tripNoteTargets.js';
import { colorForIndex } from '../config.js';

const PERSISTENCE_LABEL_KEYS = Object.freeze({
  saved: 'persistenceSaved',
  pending: 'persistencePending',
  local: 'persistenceLocal',
  syncing: 'persistenceSyncing',
  conflict: 'persistenceConflict',
  error: 'persistenceError',
});

function persistenceLabelKey(state) {
  return PERSISTENCE_LABEL_KEYS[state] || PERSISTENCE_LABEL_KEYS.pending;
}

export function AppMapPane({
  trip,
  mapView = 'segments',
  itineraryPanels,
  updateSegment,
  updateExpenses,
  updateOriginDetails,
  updateOriginExpenses,
  addPlace,
  intlLocale,
  persistenceState = 'saved',
  toast,
  t,
}) {
  const { noteTarget, detailsTarget, close } = itineraryPanels;
  const persistenceLabel = t(persistenceLabelKey(persistenceState));
  const persistenceHasCheck = persistenceState === 'saved' || persistenceState === 'local';
  const stopSequence = buildItineraryStopSequence(trip.origin, trip.segments, colorForIndex);

  const noteFooter = (length) => (
    <div className="segnote__foot">
      <span className="segnote__saved" data-persistence-state={persistenceState}>
        {persistenceHasCheck && <IconCheck size={12} aria-hidden="true" />} {persistenceLabel}
      </span>
      <span className="segnote__count">{length} / 500</span>
    </div>
  );

  const openNotePanel = () => {
    if (noteTarget === ORIGIN_NOTE_TARGET) {
      const originName = trip.origin?.name || t('origin');
      const note = trip.originDetails?.note || '';
      const originNoteLabel = `${t('segmentNote')}: ${t('origin')}`;

      return (
        <div
          className="segnote"
          data-note-target="origin"
          role="dialog"
          aria-label={originNoteLabel}
          style={{ zIndex: 720 }}
        >
          <div className="segnote__head">
            <span className="segnote__badge" style={{ background: colorForIndex(0) }} aria-hidden="true" />
            <span className="segnote__title">{t('origin')}: {originName}</span>
            <button type="button" className="segnote__x" aria-label={t('closeNote')} onClick={close}>
              <IconX size={16} aria-hidden="true" />
            </button>
          </div>
          <textarea
            className="segnote__textarea"
            maxLength={500}
            aria-label={originNoteLabel}
            placeholder={t('segmentNotePlaceholder')}
            value={note}
            onChange={(event) => updateOriginDetails({ note: event.target.value })}
            autoFocus
          />
          {noteFooter(note.length)}
        </div>
      );
    }

    const segment = trip.segments.find((item) => item.id === noteTarget);
    if (!segment) return null;
    const index = trip.segments.findIndex((item) => item.id === noteTarget);
    const stop = stopSequence[index];
    const legOrigin = index === 0
      ? trip.origin
      : trip.segments[index - 1]?.destination || null;
    const originName = legOrigin?.name || t('origin');
    const destinationName = segment.destination?.name || t('destination');
    const note = segment.note || '';

    return (
      <div
        className="segnote"
        data-segment-id={segment.id}
        role="dialog"
        aria-label={t('segmentNote')}
        style={{ zIndex: 720 }}
      >
        <div className="segnote__head">
          {stop?.number != null && (
            <span className="segnote__badge" style={{ background: stop.color }}>{stop.number}</span>
          )}
          <span className="segnote__title">
            {originName}<IconArrowRight size={11} aria-hidden="true" />{destinationName}
          </span>
          <button type="button" className="segnote__x" aria-label={t('closeNote')} onClick={close}>
            <IconX size={16} aria-hidden="true" />
          </button>
        </div>
        <textarea
          className="segnote__textarea"
          maxLength={500}
          aria-label={t('segmentNote')}
          placeholder={t('segmentNotePlaceholder')}
          value={note}
          onChange={(event) => updateSegment(segment.id, { note: event.target.value })}
          autoFocus
        />
        {noteFooter(note.length)}
      </div>
    );
  };

  const notePanel = noteTarget ? openNotePanel() : null;
  const detailsPanel = detailsTarget ? (
    <ItineraryDetailsModal
      target={detailsTarget}
      trip={trip}
      locale={intlLocale}
      onClose={close}
      updateSegment={updateSegment}
      updateExpenses={updateExpenses}
      updateOriginDetails={updateOriginDetails}
      updateOriginExpenses={updateOriginExpenses}
      t={t}
    />
  ) : null;
  const hasFloatingPanel = Boolean(notePanel || detailsPanel);

  return (
    <section className="mappane" aria-label={t('mapRegion')}>
      <RouteMap
        origin={trip.origin}
        segments={trip.segments}
        places={trip.places || []}
        routeConnections={trip.routeConnections || []}
        addPlace={addPlace}
        viewMode={mapView}
      />
      {hasFloatingPanel && (
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
            close();
          }}
        />
      )}
      {notePanel}
      {detailsPanel}
      {toast && <div className="toast" role="status" aria-live="polite">{toast}</div>}
    </section>
  );
}
