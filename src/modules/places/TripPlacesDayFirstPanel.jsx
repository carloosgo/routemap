import { Fragment, useEffect, useMemo, useRef, useState } from 'react';
import {
  IconCheck,
  IconChevronDown,
  IconChevronRight,
  IconGripVertical,
  IconMapPin,
  IconNote,
  IconX,
} from '@tabler/icons-react';
import { flagImageUrl } from '../flags/flags.js';
import {
  itineraryCalendarDays,
  placeTripDayOffset,
} from '../trips/globalTripDayPlanning.js';
import { savedPlaceRoutePairKey } from '../routes/routeModel.js';
import { useLiveRoutesVersion, withLiveGeometry } from '../routes/liveRouteStore.js';
import { NextCityTransfer } from './NextCityTransfer.jsx';
import { cityTransfers } from './cityTransferModel.js';
import {
  cityDayGroups,
  countryKey,
  dayRouteTotals,
  defaultOpenDay,
  formatDistance,
  groupPlacesByItineraryDay,
  itineraryAssignmentsByDay,
  placeColor,
  placeCountryColors,
} from './placesDayModel.js';
import { TripRouteConnections, formatDuration } from './TripRouteConnections.jsx';
import './TripPlacesPanel.css';

const PERSISTENCE_LABEL_KEYS = Object.freeze({
  saved: 'persistenceSaved',
  pending: 'persistencePending',
  local: 'persistenceLocal',
  syncing: 'persistenceSyncing',
  conflict: 'persistenceConflict',
  error: 'persistenceError',
});

// Variante D aprobada: lista de días agrupada por ciudad, un día abierto a la vez.
const MY_ROUTES_STYLES = `
.mr{display:flex;flex:1;min-height:0;flex-direction:column;overflow-x:hidden;overflow-y:auto;scrollbar-gutter:stable;font-family:var(--font-body);color:#0b1f2c}
.mr__top{position:sticky;top:0;z-index:30;display:flex;align-items:center;justify-content:space-between;gap:8px;min-height:50px;padding:10px 16px;border-bottom:1px solid #eef0f2;background:#fff}
.mr__overline{color:#667085;font-size:11px;font-weight:600;letter-spacing:.6px;text-transform:uppercase}
.mr__pending{display:inline-flex;align-items:center;gap:6px;height:28px;padding:0 11px;border:1px solid #f3d3cb;border-radius:999px;background:#fbe8e3;color:#a3422e;font:600 12px var(--font-body);cursor:pointer}
.mr__pending[aria-expanded=true]{border-color:#a3422e}
.mr__city{display:flex;align-items:center;gap:10px;padding:18px 16px 8px;color:#0b1f2c;font-size:15px;font-weight:600}
.mr__city img{width:24px;height:16px;border-radius:3px;object-fit:cover;box-shadow:0 0 0 1px rgba(0,0,0,.08)}
.mr__city small{color:#667085;font-size:12.5px;font-weight:500}
.mr__day{position:relative;border-bottom:1px solid #eef0f2}
.mr__day.is-drop-target{box-shadow:inset 3px 0 0 var(--atlas-accent)}
.mr__row{display:grid;width:100%;min-height:46px;grid-template-columns:minmax(0,1fr) 16px;align-items:center;gap:12px;padding:6px 16px;border:0;background:#fff;color:#0b1f2c;font:500 13.5px var(--font-body);text-align:left;cursor:pointer}
.mr__row:hover,.mr__row:focus-visible{background:#f8fafb;outline:none}
.mr__row:focus-visible{box-shadow:inset 0 0 0 2px #19a5d0}
.mr__title{min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.mr__title strong{font-weight:600}
.mr__title small{color:#667085;font-size:13px;font-weight:500}
.mr__summary{color:#5b6080;font-size:12px;white-space:nowrap}
.mr__head{display:flex;min-height:50px;align-items:center;gap:6px;padding-right:12px;background:#f1f8f7}.mr__head .mr__row{flex:1;min-width:0;min-height:50px;grid-template-columns:minmax(0,1fr) auto;background:transparent}.mr__head .mr__row:hover{background:transparent}

.mr__head .mr__summary{color:#2a7d73;font-weight:600}
.mr__head .mr__title strong{font-weight:700}
.mr__icon-btn{display:inline-flex;width:32px;height:32px;align-items:center;justify-content:center;padding:0;border:0;border-radius:8px;background:transparent;color:#5b6080;cursor:pointer}
.mr__icon-btn:hover,.mr__icon-btn:focus-visible{background:#dfecea;color:#0b1f2c;outline:none}
.mr__icon-btn.has-note{color:#0e4f63}
.mr__icon-btn:disabled{opacity:.4;cursor:default}.mr__icon-btn--plain{color:#2a7d73}
.mr__body{padding:6px 16px 14px 16px;background:#fbfcfc}
.mr__empty{padding:10px 0 6px 44px;color:#7c8797;font-size:12.5px}
.mr-place{position:relative;display:grid;min-height:52px;grid-template-columns:32px minmax(0,1fr) auto;align-items:center;column-gap:12px;margin:0 -8px 0 0;padding:4px 8px 4px 0;border-radius:10px;cursor:pointer}
.mr-place:hover{background:#f3f6f7}
.mr-place.is-selected{background:#e8f3f1}
.mr-place.is-dragging{z-index:20;background:#fff;box-shadow:0 12px 28px rgba(15,23,42,.18);transform:translateY(var(--mr-drag-y,0));pointer-events:none}
.mr-place.is-drop-before:before,.mr-place.is-drop-after:after{content:'';position:absolute;right:8px;left:40px;height:2px;border-radius:999px;background:var(--atlas-accent)}
.mr-place.is-drop-before:before{top:-1px}.mr-place.is-drop-after:after{bottom:-1px}
.mr-place__num{display:inline-flex;width:28px;height:28px;justify-self:center;align-items:center;justify-content:center;border-radius:50%;background:var(--mr-color);color:#fff;font-size:13px;font-weight:700;box-shadow:0 0 0 3px #fbfcfc,0 0 0 4px color-mix(in srgb,var(--mr-color) 30%,#fff)}
.mr-place.is-selected .mr-place__num{box-shadow:0 0 0 3px #e8f3f1,0 0 0 4.5px var(--mr-color)}
.mr-place__num--none{background:#c9ced7}
.mr-place__text{min-width:0}
.mr-place__text strong{display:block;overflow:hidden;font-size:14px;font-weight:600;text-overflow:ellipsis;white-space:nowrap}
.mr-place__text small{display:block;overflow:hidden;margin-top:2px;color:#5b6080;font-size:12px;text-overflow:ellipsis;white-space:nowrap}
.mr-place__actions{display:flex;align-items:center;gap:2px;opacity:0;transition:opacity .12s ease}
.mr-place:hover .mr-place__actions,.mr-place:focus-within .mr-place__actions,.mr-place.is-selected .mr-place__actions{opacity:1}
@media (hover:none){.mr-place__actions{opacity:1}}
.mr-place__actions button{display:inline-flex;width:30px;height:30px;align-items:center;justify-content:center;padding:0;border:0;border-radius:7px;background:transparent;color:#8a94a3;cursor:pointer}
.mr-place__actions button:hover,.mr-place__actions button:focus-visible{background:#e6ecef;color:#0b1f2c;outline:none}
.mr-place__actions .has-note{color:#0e4f63}
.mr-place__actions .mr-place__drag{cursor:grab;touch-action:none}
.mr-place__actions .mr-place__drag:active{cursor:grabbing}
.mr-place__move{position:relative;display:inline-flex}
.mr-place__menu{position:absolute;z-index:80;top:34px;right:0;display:flex;width:min(290px,calc(100vw - 48px));max-height:260px;flex-direction:column;gap:2px;padding:6px;overflow-y:auto;border:1px solid #e2e4e9;border-radius:10px;background:#fff;box-shadow:0 12px 30px rgba(15,23,42,.16);cursor:default}
.mr-place__menu strong{padding:4px 8px 6px;color:#667085;font-size:11px;font-weight:600;letter-spacing:.5px;text-transform:uppercase}
.mr-place__actions .mr-place__menu button{width:100%;height:auto;min-height:34px;justify-content:flex-start;padding:6px 8px;color:#0b1f2c;font:500 12.5px var(--font-body);text-align:left}
.mr-place__has-note-dot{position:absolute;top:8px;right:4px;width:6px;height:6px;border-radius:50%;background:#0e4f63}
.mr-place:hover .mr-place__has-note-dot,.mr-place:focus-within .mr-place__has-note-dot,.mr-place.is-selected .mr-place__has-note-dot{display:none}
.mr__transfer{margin:2px 0}
@media (max-width:560px){.mr__head .mr__row{grid-template-columns:minmax(0,1fr)}.mr__head .mr__summary{display:none}}
`;

const UNASSIGNED_KEY = 'unassigned';

function dayCityNames(assignments) {
  const names = (assignments || [])
    .map(({ destination }) => destination?.name || '')
    .filter(Boolean);
  return [...new Set(names)].join(' / ');
}

function persistenceLabelKey(state) {
  return PERSISTENCE_LABEL_KEYS[state] || PERSISTENCE_LABEL_KEYS.pending;
}

function formatDayDate(value, intlLocale, long = true) {
  if (!value) return '';
  const date = new Date(`${value}T00:00:00Z`);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat(intlLocale || 'es-MX', long
    ? { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'UTC' }
    : { day: 'numeric', month: 'long', timeZone: 'UTC' }).format(date);
}

function placeTitle(place, t) {
  return place?.name || place?.userLabel || t('place');
}

function placeSubtitle(place, segmentById) {
  const destination = segmentById.get(place?.segmentId)?.destination || null;
  const city = place?.city || destination?.name || '';
  const parts = [place?.category, city].map((value) => String(value || '').trim()).filter(Boolean);
  return [...new Set(parts)].join(' · ');
}

export function TripPlacesDayFirstPanel({
  segments = [],
  places = [],
  routes = [],
  toggleSegmentNote,
  updatePlace,
  removePlace,
  reorderPlace,
  movePlaceToDay,
  upsertRoute,
  removeRoute,
  openDay: controlledOpenDay,
  setOpenDay: setControlledOpenDay,
  selectedPlaceId = '',
  selectPlace,
  persistenceState = 'saved',
  t,
  intlLocale,
}) {
  useLiveRoutesVersion();
  const panelRef = useRef(null);
  const placeDragRef = useRef(null);
  const [placeDrag, setPlaceDrag] = useState(null);
  const [localOpenDay, setLocalOpenDay] = useState(undefined);
  const [moveMenuPlaceId, setMoveMenuPlaceId] = useState('');
  const [notePlaceId, setNotePlaceId] = useState('');
  const [placeToDelete, setPlaceToDelete] = useState(null);

  const calendarDays = useMemo(() => itineraryCalendarDays(segments), [segments]);
  const grouped = useMemo(() => groupPlacesByItineraryDay(places, segments), [places, segments]);
  const assignmentsByDay = useMemo(() => itineraryAssignmentsByDay(segments), [segments]);
  const cityGroups = useMemo(() => cityDayGroups(grouped.groups, assignmentsByDay), [grouped.groups, assignmentsByDay]);
  const segmentById = useMemo(() => new Map(segments.map((segment) => [segment.id, segment])), [segments]);
  const colors = useMemo(() => placeCountryColors(segments, places), [segments, places]);
  const routeByPair = useMemo(
    () => new Map(routes.map((route) => [savedPlaceRoutePairKey(route), route])),
    [routes]
  );

  const controlled = typeof setControlledOpenDay === 'function';
  const rawOpenDay = controlled ? controlledOpenDay : localOpenDay;
  const fallbackOpenDay = useMemo(() => defaultOpenDay(grouped.groups), [grouped.groups]);
  const openDay = rawOpenDay === undefined ? fallbackOpenDay : rawOpenDay;
  const setOpenDay = (value) => {
    if (controlled) setControlledOpenDay(value);
    else setLocalOpenDay(value);
  };

  useEffect(() => {
    if (controlled && controlledOpenDay === undefined && fallbackOpenDay != null) {
      setControlledOpenDay(fallbackOpenDay);
    }
  }, [controlled, controlledOpenDay, fallbackOpenDay, setControlledOpenDay]);

  const notePlace = notePlaceId
    ? places.find((place) => place.id === notePlaceId) || null
    : null;
  const persistenceLabel = t(persistenceLabelKey(persistenceState));
  const persistenceHasCheck = persistenceState === 'saved' || persistenceState === 'local';

  function routeFor(left, right) {
    const route = routeByPair.get(`${left.id}\u0000${right.id}`);
    return route && route.visible !== false ? withLiveGeometry(route) : null;
  }

  useEffect(() => {
    if (notePlaceId && !notePlace) setNotePlaceId('');
  }, [notePlace, notePlaceId]);

  // Si el lugar se elige desde el mapa, se muestra en la lista.
  useEffect(() => {
    if (!selectedPlaceId) return;
    const node = panelRef.current?.querySelector(`[data-place-id="${CSS.escape(selectedPlaceId)}"]`);
    node?.scrollIntoView?.({ block: 'nearest', behavior: 'smooth' });
  }, [selectedPlaceId, openDay]);

  useEffect(() => {
    if (!moveMenuPlaceId) return undefined;
    const close = (event) => {
      if (event.target?.closest?.('[data-place-move-menu]')) return;
      setMoveMenuPlaceId('');
    };
    document.addEventListener('pointerdown', close);
    return () => document.removeEventListener('pointerdown', close);
  }, [moveMenuPlaceId]);

  useEffect(() => {
    const draggedPlaceId = placeDrag?.placeId;
    if (!draggedPlaceId) return undefined;
    const panel = panelRef.current;
    if (!panel) return undefined;

    const resolveTarget = (event) => {
      const days = Array.from(panel.querySelectorAll('[data-trip-day-offset]'))
        .map((element) => ({
          offset: Number(element.dataset.tripDayOffset),
          bounds: element.getBoundingClientRect(),
        }))
        .filter(({ offset, bounds }) => Number.isInteger(offset) && bounds.height > 0);
      if (!days.length) return { targetOffset: null, targetId: null, placement: null };

      const hovered = days.find(({ bounds }) =>
        event.clientY >= bounds.top && event.clientY <= bounds.bottom
      );
      const day = hovered || days.reduce((best, candidate) => {
        const midpoint = candidate.bounds.top + candidate.bounds.height / 2;
        const distance = Math.abs(event.clientY - midpoint);
        return !best || distance < best.distance ? { ...candidate, distance } : best;
      }, null);
      if (!day) return { targetOffset: null, targetId: null, placement: null };

      const candidates = Array.from(
        panel.querySelectorAll(`[data-trip-day-offset="${day.offset}"] [data-place-id]`)
      )
        .map((element) => ({ id: element.dataset.placeId, bounds: element.getBoundingClientRect() }))
        .filter(({ id }) => id && id !== draggedPlaceId);
      const nearest = candidates.reduce((best, candidate) => {
        const midpoint = candidate.bounds.top + candidate.bounds.height / 2;
        const distance = Math.abs(event.clientY - midpoint);
        return !best || distance < best.distance ? { ...candidate, distance } : best;
      }, null);

      return {
        targetOffset: day.offset,
        targetId: nearest?.id || null,
        placement: nearest
          ? (event.clientY >= nearest.bounds.top + nearest.bounds.height / 2 ? 'after' : 'before')
          : null,
      };
    };

    const move = (event) => {
      event.preventDefault();
      const current = placeDragRef.current;
      if (!current) return;
      const next = {
        ...current,
        offsetY: event.clientY - current.startY,
        ...resolveTarget(event),
      };
      placeDragRef.current = next;
      setPlaceDrag(next);
    };

    const finish = (commit) => {
      const current = placeDragRef.current;
      if (commit && current && Number.isInteger(current.targetOffset)) {
        const source = places.find((place) => place.id === current.placeId);
        const sourceOffset = source ? placeTripDayOffset(source, segments) : null;
        if (sourceOffset !== current.targetOffset) {
          movePlaceToDay?.(current.placeId, current.targetOffset);
        } else if (current.targetId && current.placement) {
          reorderPlace?.(current.placeId, current.targetId, current.placement);
        }
      }
      placeDragRef.current = null;
      setPlaceDrag(null);
    };

    const up = () => finish(true);
    const cancel = () => finish(false);
    document.addEventListener('pointermove', move, { passive: false });
    document.addEventListener('pointerup', up);
    document.addEventListener('pointercancel', cancel);
    return () => {
      document.removeEventListener('pointermove', move);
      document.removeEventListener('pointerup', up);
      document.removeEventListener('pointercancel', cancel);
    };
  }, [placeDrag?.placeId, places, segments, movePlaceToDay, reorderPlace]);

  function startPlaceDrag(event, placeId) {
    if (event.pointerType === 'mouse' && event.button !== 0) return;
    event.preventDefault();
    event.stopPropagation();
    const next = {
      placeId,
      startY: event.clientY,
      offsetY: 0,
      targetOffset: null,
      targetId: null,
      placement: null,
    };
    placeDragRef.current = next;
    setPlaceDrag(next);
  }

  function toggleDay(key) {
    setOpenDay(openDay === key ? null : key);
  }

  function confirmRemovePlace() {
    if (!placeToDelete) return;
    removePlace?.(placeToDelete.id);
    setPlaceToDelete(null);
  }

  function renderPlace(place, number) {
    const dragging = placeDrag?.placeId === place.id;
    const dropClass = placeDrag?.targetId === place.id && placeDrag?.placement
      ? ` is-drop-${placeDrag.placement}`
      : '';
    const selected = selectedPlaceId === place.id;
    const color = placeColor(place, segmentById, colors);
    const subtitle = placeSubtitle(place, segmentById);

    return (
      <article
        key={place.id}
        className={'mr-place' + (dragging ? ' is-dragging' : '') + (selected ? ' is-selected' : '') + dropClass}
        data-place-id={place.id}
        style={{ '--mr-color': color, ...(dragging ? { '--mr-drag-y': `${placeDrag.offsetY}px` } : null) }}
        onClick={(event) => {
          if (event.target.closest('button')) return;
          selectPlace?.(selected ? '' : place.id);
        }}
      >
        <span className={'mr-place__num' + (number ? '' : ' mr-place__num--none')} aria-hidden="true">
          {number || '·'}
        </span>
        <span className="mr-place__text">
          <strong>{placeTitle(place, t)}</strong>
          {subtitle && <small>{subtitle}</small>}
        </span>
        <span className="mr-place__actions">
          <span className="mr-place__move" data-place-move-menu>
            <button
              type="button"
              className="mr-place__drag"
              onPointerDown={(event) => startPlaceDrag(event, place.id)}
              onClick={() => setMoveMenuPlaceId((current) => current === place.id ? '' : place.id)}
              aria-label={t('movePlace')}
              title={t('movePlace')}
            >
              <IconGripVertical size={15} aria-hidden="true" />
            </button>
            {moveMenuPlaceId === place.id && (
              <div className="mr-place__menu" role="menu">
                <strong>{t('movePlaceTo')}</strong>
                {calendarDays.map((day) => {
                  const cities = dayCityNames(assignmentsByDay.get(day.tripDayOffset));
                  if (!cities) return null;
                  return (
                    <button
                      type="button"
                      role="menuitem"
                      key={day.date}
                      onClick={() => {
                        movePlaceToDay?.(place.id, day.tripDayOffset);
                        setMoveMenuPlaceId('');
                      }}
                    >
                      {`${t('day')} ${day.globalDayNumber} · ${formatDayDate(day.date, intlLocale, false)} · ${cities}`}
                    </button>
                  );
                })}
              </div>
            )}
          </span>
          <button
            type="button"
            className={place.note ? 'has-note' : ''}
            onClick={() => setNotePlaceId(place.id)}
            aria-label={t('placeNote')}
            title={t('placeNote')}
          >
            <IconNote size={15} aria-hidden="true" />
          </button>
          <button
            type="button"
            onClick={() => setPlaceToDelete(place)}
            aria-label={t('delete')}
            title={t('delete')}
          >
            <IconX size={15} aria-hidden="true" />
          </button>
        </span>
        {place.note && <span className="mr-place__has-note-dot" aria-hidden="true" />}
      </article>
    );
  }

  function renderDayBody(day) {
    const transfers = cityTransfers(day.assignments);
    const arrivalSegmentId = day.assignments.at(-1)?.segmentId;
    const firstArrivalIndex = transfers.length
      ? day.places.findIndex((place) => place.segmentId === arrivalSegmentId)
      : -1;
    const transferIndex = transfers.length
      ? (firstArrivalIndex >= 0 ? firstArrivalIndex : day.places.length)
      : -1;
    const transferCards = transfers.map(({ key, from, to }) => (
      <div className="mr__transfer" key={key}>
        <NextCityTransfer from={from} to={to} date={day.date} t={t} intlLocale={intlLocale} />
      </div>
    ));

    return (
      <div className="mr__body">
        {transferIndex === 0 && transferCards}
        {day.places.length === 0 && <div className="mr__empty">{t('dayNoPlaces')}</div>}
        {day.places.map((place, index) => {
          const next = day.places[index + 1] || null;
          const crossesTransfer = next && transferIndex === index + 1;
          return (
            <Fragment key={place.id}>
              {renderPlace(place, index + 1)}
              {next && !crossesTransfer && (
                <TripRouteConnections
                  origin={place}
                  destination={next}
                  route={routeByPair.get(`${place.id}\u0000${next.id}`) || null}
                  date={day.date}
                  upsertRoute={upsertRoute}
                  removeRoute={removeRoute}
                  t={t}
                  intlLocale={intlLocale}
                />
              )}
              {crossesTransfer && transferCards}
            </Fragment>
          );
        })}
        {transferIndex > 0 && transferIndex === day.places.length && transferCards}
      </div>
    );
  }

  // Solo el día abierto resume sus traslados; las filas cerradas quedan limpias.
  function daySummary(day) {
    if (!day.places.length) return '';
    const totals = dayRouteTotals(day.places, routeFor);
    return [
      formatDistance(totals.distance, intlLocale),
      totals.duration ? formatDuration(totals.duration) : '',
    ].filter(Boolean).join(' · ');
  }

  function renderDay(day, groupColor) {
    const open = openDay === day.tripDayOffset;
    const dropTarget = placeDrag && placeDrag.targetOffset === day.tripDayOffset;
    const noteSegment = day.assignments[0]?.segment || null;
    const title = `${t('day')} ${day.globalDayNumber}`;
    // La ciudad ya la dice la cabecera del grupo: el día solo lleva su fecha.
    const date = formatDayDate(day.date, intlLocale);
    const color = groupColor;
    const rowButton = (
      <button
        type="button"
        className="mr__row"
        aria-expanded={open}
        onClick={() => toggleDay(day.tripDayOffset)}
      >
        <span className="mr__title"><strong>{title}</strong>{date && <small>{`\u00a0· ${date}`}</small>}</span>
        {open && <span className="mr__summary">{daySummary(day)}</span>}
        {!open && <IconChevronRight size={15} color="#8a94a3" aria-hidden="true" />}
      </button>
    );

    return (
      <section
        className={'mr__day' + (open ? ' is-open' : '') + (dropTarget ? ' is-drop-target' : '')}
        key={day.date}
        data-trip-day-offset={day.tripDayOffset}
        style={{ '--mr-color': color }}
      >
        {open ? (
          <div className="mr__head">
            {rowButton}
            <button
              type="button"
              className={'mr__icon-btn' + (noteSegment?.note ? ' has-note' : '')}
              onClick={() => noteSegment && toggleSegmentNote?.(noteSegment.id)}
              disabled={!noteSegment}
              aria-label={t('segmentNote')}
              title={t('segmentNote')}
            >
              <IconNote size={15} aria-hidden="true" />
            </button>
            <button
              type="button"
              className="mr__icon-btn mr__icon-btn--plain"
              aria-label={t('collapse')}
              title={t('collapse')}
              onClick={() => toggleDay(day.tripDayOffset)}
            >
              <IconChevronDown size={15} aria-hidden="true" />
            </button>
          </div>
        ) : rowButton}
        {open && renderDayBody(day)}
      </section>
    );
  }

  if (!calendarDays.length) {
    return (
      <div className="trip-places trip-places--empty" ref={panelRef}>
        <IconMapPin size={22} aria-hidden="true" />
        <strong>{t('noPlanningDaysTitle')}</strong>
        <span>{t('noPlanningDaysHint')}</span>
      </div>
    );
  }

  const unassignedOpen = openDay === UNASSIGNED_KEY;

  return (
    <>
      <style>{MY_ROUTES_STYLES}</style>
      <div className="mr" ref={panelRef}>
        <div className="mr__top">
          <span className="mr__overline">{t('tripDaysCount', { count: calendarDays.length })}</span>
          {grouped.unassigned.length > 0 && (
            <button
              type="button"
              className="mr__pending"
              aria-expanded={unassignedOpen}
              onClick={() => toggleDay(UNASSIGNED_KEY)}
              title={t('unassignedPlacesHint')}
            >
              {t('unassignedPlacesCount', { count: grouped.unassigned.length })}
            </button>
          )}
        </div>

        {grouped.unassigned.length > 0 && unassignedOpen && (
          <section className="mr__day is-open" data-unassigned-places style={{ '--mr-color': '#c9ced7' }}>
            <div className="mr__body">
              <div className="mr__empty" style={{ paddingLeft: 0 }}>{t('unassignedPlacesHint')}</div>
              {grouped.unassigned.map((place) => renderPlace(place, 0))}
            </div>
          </section>
        )}

        {cityGroups.map((group) => {
          const destination = group.destination;
          const flag = flagImageUrl(destination?.countryCode, 40);
          const groupColor = colors.get(countryKey(destination)) || '#64748b';
          return (
            <div key={group.key}>
              <div className="mr__city">
                {flag && <img src={flag} alt="" width={16} height={11} />}
                {destination?.name || t('city')}
                <small>{t(group.days.length === 1 ? 'dayCountOne' : 'dayCountMany', { count: group.days.length })}</small>
              </div>
              {group.days.map((day) => renderDay(day, groupColor))}
            </div>
          );
        })}
      </div>

      {notePlace && (
        <div className="confirm__scrim" role="presentation" onMouseDown={() => setNotePlaceId('')}>
          <div
            className="confirm__card trip-place-note-dialog"
            role="dialog"
            aria-modal="true"
            aria-label={t('placeNote')}
            onMouseDown={(event) => event.stopPropagation()}
          >
            <div className="segnote__head">
              <span className="segnote__title">{placeTitle(notePlace, t)}</span>
              <button type="button" className="segnote__x" aria-label={t('closeNote')} onClick={() => setNotePlaceId('')}>
                <IconX size={16} aria-hidden="true" />
              </button>
            </div>
            <textarea
              className="segnote__textarea"
              value={notePlace.note || ''}
              maxLength={500}
              placeholder={t('placeNotePlaceholder')}
              onChange={(event) => updatePlace?.(notePlace.id, { note: event.target.value })}
              autoFocus
            />
            <div className="segnote__foot">
              <span className="segnote__saved" data-persistence-state={persistenceState}>
                {persistenceHasCheck && <IconCheck size={12} aria-hidden="true" />} {persistenceLabel}
              </span>
              <span className="segnote__count">{(notePlace.note || '').length} / 500</span>
            </div>
          </div>
        </div>
      )}

      {placeToDelete && (
        <div className="confirm__scrim" role="presentation" onMouseDown={() => setPlaceToDelete(null)}>
          <div
            className="confirm__card"
            role="dialog"
            aria-modal="true"
            aria-label={t('deletePlace')}
            onMouseDown={(event) => event.stopPropagation()}
          >
            <p className="confirm__message">
              {t('confirmDeletePlace', { name: placeTitle(placeToDelete, t) })}
            </p>
            <div className="confirm__actions">
              <button type="button" className="btn btn--ghost btn--sm" onClick={() => setPlaceToDelete(null)}>
                {t('cancel')}
              </button>
              <button type="button" className="btn btn--danger btn--sm" onClick={confirmRemovePlace}>
                {t('delete')}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
