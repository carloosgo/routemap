import { useMemo, useRef, useState } from 'react';
import { IconArrowRight, IconCheck, IconMap2, IconRoute, IconX } from '@tabler/icons-react';
import { RouteMap } from '../modules/map/RouteMap.jsx';
import { createGeoapifyCityProvider, canonicalCityFromSearchResult } from '../modules/geocoding/citySearchClient.js';
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

function normalizedText(value) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, ' ');
}

function sameCountry(left, right) {
  const leftCode = String(left?.countryCode || '').trim().toUpperCase();
  const rightCode = String(right?.countryCode || '').trim().toUpperCase();
  if (leftCode && rightCode) return leftCode === rightCode;
  return normalizedText(left?.country) === normalizedText(right?.country);
}

function segmentForPlaceCity(place, segments) {
  const cityName = normalizedText(place?.city);
  if (!cityName) return null;
  return (Array.isArray(segments) ? segments : []).find((segment) => {
    const destination = segment?.destination;
    return normalizedText(destination?.name) === cityName && sameCountry(destination, place);
  }) || null;
}

function bestResolvedCity(place, cities) {
  const cityName = normalizedText(place?.city);
  const exact = (Array.isArray(cities) ? cities : []).find((city) =>
    normalizedText(city?.name) === cityName && sameCountry(city, place)
  );
  return exact || (cities || []).find((city) => sameCountry(city, place)) || null;
}

export function AppMapPane({
  trip,
  mapView = 'places',
  itineraryPanels,
  updateSegment,
  updateExpenses,
  updateOriginDetails,
  updateOriginExpenses,
  addPlace,
  addCity,
  addPlaceWithCity,
  intlLocale,
  locale,
  persistenceState = 'saved',
  toast,
  t,
}) {
  const { noteTarget, detailsTarget, close } = itineraryPanels;
  const cityProviderRef = useRef(null);
  if (!cityProviderRef.current) cityProviderRef.current = createGeoapifyCityProvider();
  const [planningMessage, setPlanningMessage] = useState('');
  const [showCityTrace, setShowCityTrace] = useState(true);
  const [showSavedRoutes, setShowSavedRoutes] = useState(true);
  const persistenceLabel = t(persistenceLabelKey(persistenceState));
  const persistenceHasCheck = persistenceState === 'saved' || persistenceState === 'local';
  const stopSequence = buildItineraryStopSequence(null, trip.segments, colorForIndex);
  const unifiedRoutesView = mapView === 'places';

  const showPlanningMessage = (message, duration = 3000) => {
    setPlanningMessage(message);
    globalThis.setTimeout(() => setPlanningMessage(''), duration);
  };

  const requestCityAdd = (result) => {
    const city = canonicalCityFromSearchResult(result);
    if (!city.name || !Number.isFinite(city.lat) || !Number.isFinite(city.lon)) return false;
    addCity?.(city);
    return true;
  };

  const requestPlaceSave = async (place) => {
    const existingSegment = segmentForPlaceCity(place, trip.segments);
    if (existingSegment) {
      addPlace?.({
        ...place,
        segmentId: existingSegment.id,
        dayOffset: 0,
      });
      return true;
    }

    const cityQuery = [place?.city, place?.country].filter(Boolean).join(', ');
    if (!place?.city || !cityQuery) {
      showPlanningMessage(t('placeCityResolveError'), 3400);
      return false;
    }

    try {
      const cities = await cityProviderRef.current.search(cityQuery, {
        limit: 5,
        language: locale,
      });
      const resolved = bestResolvedCity(place, cities);
      if (!resolved) {
        showPlanningMessage(t('placeCityResolveError'), 3400);
        return false;
      }
      addPlaceWithCity?.(canonicalCityFromSearchResult(resolved), place);
      return true;
    } catch {
      showPlanningMessage(t('placeCityResolveError'), 3400);
      return false;
    }
  };

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
    const previousCity = index > 0
      ? trip.segments[index - 1]?.destination || null
      : null;
    const destinationName = segment.destination?.name || t('city');
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
            {previousCity?.name ? (
              <>{previousCity.name}<IconArrowRight size={11} aria-hidden="true" />{destinationName}</>
            ) : destinationName}
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
        origin={unifiedRoutesView ? null : trip.origin}
        segments={trip.segments}
        places={trip.places || []}
        routeConnections={trip.routeConnections || []}
        addPlace={requestPlaceSave}
        addCity={requestCityAdd}
        viewMode={mapView}
        showCityTrace={unifiedRoutesView ? showCityTrace : true}
        showSavedRoutes={unifiedRoutesView ? showSavedRoutes : false}
      />

      {unifiedRoutesView && (
        <div className="my-routes-map-mode" role="group" aria-label={t('mapTraceMode')}>
          <button
            type="button"
            className={showCityTrace ? 'is-active' : ''}
            aria-pressed={showCityTrace}
            onClick={() => setShowCityTrace((value) => !value)}
          >
            <IconMap2 size={15} stroke={1.8} aria-hidden="true" />
            <span>{t('mapCities')}</span>
          </button>
          <button
            type="button"
            className={showSavedRoutes ? 'is-active' : ''}
            aria-pressed={showSavedRoutes}
            onClick={() => setShowSavedRoutes((value) => !value)}
          >
            <IconRoute size={15} stroke={1.8} aria-hidden="true" />
            <span>{t('mapRoutes')}</span>
          </button>
        </div>
      )}

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

      {(planningMessage || toast) && (
        <div className="toast" role="status" aria-live="polite">{planningMessage || toast}</div>
      )}
    </section>
  );
}
