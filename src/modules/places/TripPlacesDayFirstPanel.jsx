import { Fragment, useEffect, useMemo, useRef, useState } from 'react';
import {
  IconCheck,
  IconMapPin,
  IconEdit,
  IconTrash,
  IconX,
} from '@tabler/icons-react';
import { flagImageUrl } from '../flags/flags.js';
import {
  itineraryCalendarDays,
  placeTripDayOffset,
} from '../trips/globalTripDayPlanning.js';
import { savedPlaceRoutePairKey } from '../routes/routeModel.js';
import { useLiveRoutesVersion, withLiveGeometry } from '../routes/liveRouteStore.js';
import { capitalizeFirst } from '../../shared/utils.js';
import { DayShareButton } from './DayShareButton.jsx';
import { NextCityTransfer } from './NextCityTransfer.jsx';
import { cityTransfers } from './cityTransferModel.js';
import {
  cityDayGroups,
  dayRouteTotals,
  defaultOpenDay,
  formatDistance,
  groupPlacesByItineraryDay,
  itineraryAssignmentsByDay,
  placeColor,
  placeCountryColors,
  stopColor,
} from './placesDayModel.js';
import { TripRouteConnections } from './TripRouteConnections.jsx';
import './TripPlacesPanel.css';

const PERSISTENCE_LABEL_KEYS = Object.freeze({
  saved: 'persistenceSaved',
  pending: 'persistencePending',
  local: 'persistenceLocal',
  syncing: 'persistenceSyncing',
  conflict: 'persistenceConflict',
  error: 'persistenceError',
});

const DRAG_SCROLL_EDGE_PX = 64;
const DRAG_SCROLL_MAX_SPEED_PX = 18;

// Contenedor que realmente se desplaza (el panel en escritorio, la hoja en móvil).
function scrollContainerFor(element) {
  for (let node = element; node && node !== document.body; node = node.parentElement) {
    const overflowY = window.getComputedStyle(node).overflowY;
    if ((overflowY === 'auto' || overflowY === 'scroll') && node.scrollHeight > node.clientHeight + 1) {
      return node;
    }
  }
  return document.scrollingElement || document.documentElement;
}

function dragScrollStep(clientY, container) {
  const isRoot = container === document.scrollingElement || container === document.documentElement;
  const bounds = isRoot
    ? { top: 0, bottom: window.innerHeight }
    : container.getBoundingClientRect();
  const top = Math.max(bounds.top, 0);
  const bottom = Math.min(bounds.bottom, window.innerHeight);
  const edge = Math.min(DRAG_SCROLL_EDGE_PX, (bottom - top) / 4);
  if (edge <= 0) return 0;
  if (clientY < top + edge) {
    return -Math.ceil(DRAG_SCROLL_MAX_SPEED_PX * Math.min(1, (top + edge - clientY) / edge));
  }
  if (clientY > bottom - edge) {
    return Math.ceil(DRAG_SCROLL_MAX_SPEED_PX * Math.min(1, (clientY - (bottom - edge)) / edge));
  }
  return 0;
}

// Variante D aprobada: lista de días agrupada por ciudad, un día abierto a la vez.
const MY_ROUTES_STYLES = `
.mr{display:flex;flex:1;min-height:0;flex-direction:column;overflow-x:hidden;overflow-y:auto;scrollbar-gutter:stable;font-family:var(--font-body);color:#0b1f2c}
.mr__top{position:sticky;top:0;z-index:30;display:flex;align-items:center;justify-content:space-between;gap:8px;min-height:50px;padding:10px 16px;border-bottom:1px solid #eef0f2;background:#fff}
.mr__overline{color:#667085;font-size:11px;font-weight:600;letter-spacing:.6px;text-transform:uppercase}
.mr__pending{display:inline-flex;align-items:center;gap:6px;height:28px;padding:0 11px;border:1px solid #f3d3cb;border-radius:999px;background:#fbe8e3;color:#a3422e;font:600 12px var(--font-body);cursor:pointer}
.mr__pending[aria-expanded=true]{border-color:#a3422e}
.mr__day{position:relative;border-bottom:1px solid #eef0f2}
.mr__day.is-drop-target{box-shadow:inset 3px 0 0 var(--atlas-accent)}
.mr__row{display:grid;width:100%;min-height:46px;grid-template-columns:minmax(0,1fr) 16px;align-items:center;gap:12px;padding:6px 16px;border:0;background:#fff;color:#0b1f2c;font:500 13.5px var(--font-body);text-align:left;cursor:pointer}
.mr__row:hover,.mr__row:focus-visible{background:#f8fafb;outline:none}
.mr__row:focus-visible{box-shadow:inset 0 0 0 2px #19a5d0}
.mr__title{min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.mr__title strong{font-weight:600}
.mr__title small{color:#667085;font-size:12px;font-weight:500}
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
.mr-place__num{display:inline-flex;width:28px;height:28px;justify-self:center;align-items:center;justify-content:center;border-radius:50%;background:var(--mr-color);color:#fff;font-size:13px;font-weight:700;line-height:1;box-shadow:0 0 0 3px #fbfcfc,0 0 0 4px color-mix(in srgb,var(--mr-color) 30%,#fff)}
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
.mr-place__move .mr-place__drag{padding:0;border:0;font-family:inherit;cursor:grab;touch-action:none}
.mr-place__move .mr-place__drag:active{cursor:grabbing}
.mr-place__move .mr-place__drag:focus-visible{outline:2px solid var(--mr-color);outline-offset:3px}
.mr-place__move .mr-place__menu{right:auto;left:0}
.mr-place__move{position:relative;display:inline-flex;justify-self:center}
.mr-place__menu{position:absolute;z-index:80;top:34px;right:0;display:flex;width:min(290px,calc(100vw - 48px));max-height:260px;flex-direction:column;gap:2px;padding:6px;overflow-y:auto;border:1px solid #e2e4e9;border-radius:10px;background:#fff;box-shadow:0 12px 30px rgba(15,23,42,.16);cursor:default}
.mr-place__menu strong{padding:4px 8px 6px;color:#667085;font-size:11px;font-weight:600;letter-spacing:.5px;text-transform:uppercase}
.mr-place__menu button{display:flex;align-items:center;border:0;border-radius:7px;background:transparent;cursor:pointer;width:100%;height:auto;min-height:34px;justify-content:flex-start;padding:6px 8px;color:#0b1f2c;font:500 12.5px var(--font-body);text-align:left}
.mr-place__menu button:hover,.mr-place__menu button:focus-visible{background:#e6ecef;outline:none}
.mr-place__has-note-dot{position:absolute;top:8px;right:4px;width:6px;height:6px;border-radius:50%;background:#0e4f63}
.mr-place:hover .mr-place__has-note-dot,.mr-place:focus-within .mr-place__has-note-dot,.mr-place.is-selected .mr-place__has-note-dot{display:none}
.mr__transfer{margin:2px 0}
.mr-share{position:relative;display:inline-flex}
.mr-share .is-busy svg{animation:mr-spin .8s linear infinite}
@keyframes mr-spin{to{transform:rotate(360deg)}}
.mr__strip{display:flex;gap:8px;padding:12px 16px 14px;overflow-x:auto;scrollbar-width:none;border-bottom:1px solid #eef0f2;background:#fff}
.mr__strip::-webkit-scrollbar{display:none}
.mr-daytile{display:flex;flex:0 0 auto;width:56px;height:56px;flex-direction:column;align-items:center;justify-content:center;padding:0;border:0;border-radius:16px;background:#f4f5f7;box-shadow:inset 0 0 0 1px #e8eaee;color:#0b1f2c;font-family:var(--font-body);cursor:pointer;transition:background .15s ease,box-shadow .15s ease}
.mr-daytile small{font-size:10.5px;font-weight:600;letter-spacing:.06em;text-transform:uppercase;opacity:.75}
.mr-daytile strong{font-size:21px;font-weight:700;line-height:1.05}
.mr-daytile i{width:4px;height:4px;margin-top:2px;border-radius:50%;background:transparent}
.mr-daytile.has-places i{background:#19a5d0}
.mr-daytile.is-selected{background:#1f2933;box-shadow:0 6px 14px rgba(15,23,42,.22);color:#fff}
.mr-daytile.is-selected.has-places i{background:#7fd3ec}
.mr-daytile.is-drop-target{box-shadow:inset 0 0 0 2px var(--atlas-accent)}
.mr-daytile:focus-visible{outline:2px solid #19a5d0;outline-offset:2px}
.mr__dayhead{display:flex;align-items:center;gap:8px;padding:16px 12px 10px 16px}
.mr__dayhead-text{display:flex;flex:1;min-width:0;flex-direction:column;gap:3px}
.mr__dayhead-city{display:flex;align-items:center;gap:9px;min-width:0;font-size:20px;font-weight:700;line-height:1.15}
.mr__dayhead-city img{width:26px;height:18px;flex:0 0 auto;border-radius:4px;object-fit:cover;box-shadow:0 0 0 1px rgba(0,0,0,.08)}
.mr__dayhead-city span{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.mr__dayhead-sub{color:#5b6573;font-size:13.5px}
.mr__dayhead-sub strong{color:#1f2933;font-weight:600}
.mr__dayhead .mr__icon-btn{width:40px;height:40px;border-radius:50%;background:#f1f3f5}
.mr__body{padding:2px 16px 18px;background:#fff}
.mr__body .mr-place{margin:0}
.mr-card{position:relative;border-radius:14px;overflow:hidden}
.mr-card.is-dragging{overflow:visible;z-index:20}
.mr-card__delete{position:absolute;top:0;right:0;bottom:0;display:flex;width:84px;flex-direction:column;align-items:center;justify-content:center;gap:4px;border:0;border-radius:0 14px 14px 0;background:#d94f4f;color:#fff;font:600 12px var(--font-body);opacity:0;cursor:pointer}
.mr-card.is-swiped .mr-card__delete,.mr-card.is-swiping .mr-card__delete{opacity:1}
.mr-card .mr-place{min-height:64px;padding:8px 6px 8px 12px;border:1.5px solid #e6e8ec;border-radius:14px;background:#fff;box-shadow:0 1px 2px rgba(15,23,42,.04);touch-action:pan-y;-webkit-user-select:none;user-select:none;-webkit-touch-callout:none;transition:transform .22s ease,box-shadow .2s ease,border-color .2s ease}
.mr-card.is-swiping .mr-place{transition:none}
.mr-card .mr-place:hover{background:#fafbfc}
.mr-card .mr-place.is-selected{border-color:#9cc9d6;background:#f5fbfd}
.mr-card .mr-place.is-dragging{border-color:#19a5d0;background:#fff;box-shadow:0 14px 30px rgba(15,23,42,.22);transform:translateY(var(--mr-drag-y,0)) scale(1.03)}
.mr-card .mr-place.is-dragging .mr-place__text{animation:mr-wiggle .5s ease-in-out infinite}
@keyframes mr-wiggle{0%,100%{transform:rotate(0)}25%{transform:rotate(-.6deg)}75%{transform:rotate(.6deg)}}
@media (prefers-reduced-motion:reduce){.mr-card .mr-place.is-dragging .mr-place__text{animation:none}}
.mr-card .mr-place__text strong{font-size:15.5px}
.mr-card .mr-place__text small{font-size:13px;color:#5b6573}
.mr-card .mr-place__actions{opacity:1}
.mr-card .mr-place__actions button{width:40px;height:40px;border-radius:10px}
.mr-card .mr-place__note{position:relative}
.mr-card .mr-place__note-dot{position:absolute;top:8px;right:8px;width:7px;height:7px;box-sizing:border-box;border:1.5px solid #fff;border-radius:50%;background:#19a5d0}
.mr-card .mr-place__hover-delete{display:none}
@media (hover:hover) and (pointer:fine){.mr-card:hover .mr-place__hover-delete{display:inline-flex;color:#b42318}}
.mr__body .mr-route,.mr__body .mr__transfer{margin:2px 0}
.mr__body > * + .mr-card{margin-top:4px}
.mr__hint{margin:12px 0 0;color:#6b7684;font-size:12px;line-height:1.5;text-align:center}
.mr__hint--mouse{display:none}
@media (hover:hover) and (pointer:fine){.mr__hint--touch{display:none}.mr__hint--mouse{display:block}}
.mr-share__status{position:absolute;z-index:80;top:36px;right:0;padding:6px 10px;border-radius:8px;background:#0b1f2c;color:#fff;font-size:12px;font-weight:600;max-width:min(300px,calc(100vw - 32px));white-space:normal;box-shadow:0 8px 20px rgba(15,23,42,.18)}
`;

const UNASSIGNED_KEY = 'unassigned';

function dayCityNames(assignments) {
  const names = (assignments || [])
    .map(({ destination }) => capitalizeFirst(destination?.name))
    .filter(Boolean);
  return [...new Set(names)].join(' / ');
}

function dayCities(assignments) {
  const seen = new Set();
  return (assignments || []).flatMap(({ destination }) => {
    const name = capitalizeFirst(destination?.name);
    if (!name || seen.has(name)) return [];
    seen.add(name);
    return [{ name, countryCode: destination?.countryCode || '' }];
  });
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

// Los nombres se muestran con mayúscula inicial aunque se hayan guardado en minúsculas.
function placeTitle(place, t) {
  return capitalizeFirst(place?.name || place?.userLabel) || t('place');
}

function placeSubtitle(place, segmentById) {
  const destination = segmentById.get(place?.segmentId)?.destination || null;
  const city = place?.city || destination?.name || '';
  const parts = [place?.category, city].map((value) => capitalizeFirst(value)).filter(Boolean);
  return [...new Set(parts)].join(' · ');
}

const LONG_PRESS_MS = 420;
const MOVE_TOLERANCE = 8;
const DELETE_WIDTH = 84;

/**
 * Tarjeta de lugar con los gestos de la lista de ciudades: tocar selecciona,
 * mantener presionado (o arrastrar con mouse) la levanta para moverla y
 * deslizar a la izquierda descubre Borrar.
 */
function SwipePlaceCard({ placeId, dragging, onTap, onLift, onDelete, deleteLabel, children }) {
  const rootRef = useRef(null);
  const gestureRef = useRef(null);
  const [offsetX, setOffsetX] = useState(0);
  const [swiping, setSwiping] = useState(false);

  useEffect(() => {
    const node = rootRef.current;
    if (!node) return undefined;
    const onTouchMove = (event) => {
      if (node.hasAttribute('data-city-gesture')) event.preventDefault();
    };
    node.addEventListener('touchmove', onTouchMove, { passive: false });
    return () => node.removeEventListener('touchmove', onTouchMove);
  }, []);

  useEffect(() => () => clearTimeout(gestureRef.current?.timer), []);

  useEffect(() => {
    if (dragging) rootRef.current?.setAttribute('data-city-gesture', 'lift');
    else if (gestureRef.current?.mode !== 'swipe') rootRef.current?.removeAttribute('data-city-gesture');
  }, [dragging]);

  const finish = () => {
    clearTimeout(gestureRef.current?.timer);
    gestureRef.current = null;
    if (!dragging) rootRef.current?.removeAttribute('data-city-gesture');
  };

  const lift = (gesture, clientY) => {
    gesture.mode = 'lift';
    rootRef.current?.setAttribute('data-city-gesture', 'lift');
    setOffsetX(0);
    try {
      globalThis.navigator?.vibrate?.(12);
    } catch {
      // Vibración opcional.
    }
    onLift({
      pointerType: gesture.pointerType,
      button: 0,
      clientY,
      preventDefault() {},
      stopPropagation() {},
    }, placeId);
  };

  const handlePointerDown = (event) => {
    if (event.pointerType === 'mouse' && event.button !== 0) return;
    if (event.target.closest?.('button')) return;
    clearTimeout(gestureRef.current?.timer);
    const gesture = {
      pointerId: event.pointerId,
      pointerType: event.pointerType,
      startX: event.clientX,
      startY: event.clientY,
      lastY: event.clientY,
      baseX: offsetX,
      mode: 'pending',
    };
    if (event.pointerType !== 'mouse') {
      gesture.timer = setTimeout(() => {
        if (gestureRef.current === gesture && gesture.mode === 'pending') lift(gesture, gesture.lastY);
      }, LONG_PRESS_MS);
    }
    gestureRef.current = gesture;
  };

  const handlePointerMove = (event) => {
    const gesture = gestureRef.current;
    if (!gesture || gesture.pointerId !== event.pointerId || gesture.mode === 'lift') return;
    gesture.lastY = event.clientY;
    const dx = event.clientX - gesture.startX;
    const dy = event.clientY - gesture.startY;
    if (gesture.mode === 'pending') {
      if (gesture.pointerType === 'mouse') {
        if (Math.abs(dy) > MOVE_TOLERANCE && Math.abs(dy) >= Math.abs(dx)) {
          lift(gesture, gesture.startY);
          return;
        }
        if (Math.abs(dx) > MOVE_TOLERANCE) gesture.mode = 'none';
      } else if (Math.abs(dx) > MOVE_TOLERANCE && Math.abs(dx) > Math.abs(dy)) {
        clearTimeout(gesture.timer);
        gesture.mode = 'swipe';
        rootRef.current?.setAttribute('data-city-gesture', 'swipe');
        setSwiping(true);
        try {
          event.currentTarget.setPointerCapture?.(event.pointerId);
        } catch {
          // Sin captura el gesto sigue mientras el dedo esté encima.
        }
      } else if (Math.abs(dy) > MOVE_TOLERANCE) {
        clearTimeout(gesture.timer);
        gesture.mode = 'none';
      }
    }
    if (gesture.mode === 'swipe') {
      setOffsetX(Math.max(-DELETE_WIDTH, Math.min(0, gesture.baseX + dx)));
    }
  };

  const handlePointerUp = (event) => {
    const gesture = gestureRef.current;
    if (!gesture || gesture.pointerId !== event.pointerId) return;
    const { mode } = gesture;
    finish();
    if (mode === 'pending') {
      if (offsetX < 0) setOffsetX(0);
      else onTap();
    } else if (mode === 'swipe') {
      setSwiping(false);
      rootRef.current?.removeAttribute('data-city-gesture');
      setOffsetX((current) => (current < -DELETE_WIDTH / 2 ? -DELETE_WIDTH : 0));
    }
  };

  const handlePointerCancel = () => {
    const mode = gestureRef.current?.mode;
    finish();
    setSwiping(false);
    if (mode === 'swipe') setOffsetX(0);
  };

  return (
    <div
      ref={rootRef}
      className={'mr-card' + (dragging ? ' is-dragging' : '') + (offsetX < 0 ? ' is-swiped' : '') + (swiping ? ' is-swiping' : '')}
      onPointerDownCapture={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onPointerCancel={handlePointerCancel}
      onContextMenu={(event) => event.preventDefault()}
    >
      <button
        type="button"
        className="mr-card__delete"
        aria-label={deleteLabel}
        tabIndex={offsetX < 0 ? 0 : -1}
        onClick={() => {
          setOffsetX(0);
          onDelete();
        }}
      >
        <IconTrash size={20} stroke={1.9} aria-hidden="true" />
        <span>{deleteLabel}</span>
      </button>
      {children(offsetX)}
    </div>
  );
}

export function TripPlacesDayFirstPanel({
  tripId = '',
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
  const allDays = useMemo(() => cityGroups.flatMap((group) => group.days), [cityGroups]);
  // Siempre hay un día a la vista: el abierto, el sugerido o el primero.
  // Solo "Por organizar" lo oculta.
  const selectedDay = openDay === UNASSIGNED_KEY
    ? null
    : allDays.find((day) => day.tripDayOffset === openDay)
      || allDays.find((day) => day.tripDayOffset === fallbackOpenDay)
      || allDays[0]
      || null;
  const stripRef = useRef(null);
  const selectedOffset = selectedDay?.tripDayOffset;
  useEffect(() => {
    if (selectedOffset == null) return;
    const tile = stripRef.current?.querySelector(`[data-trip-day-offset="${selectedOffset}"]`);
    tile?.scrollIntoView?.({ block: 'nearest', inline: 'center', behavior: 'smooth' });
  }, [selectedOffset]);
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
      // Soltar sobre un cuadro de la barra manda el lugar a ese día.
      const tile = Array.from(panel.querySelectorAll('.mr-daytile[data-trip-day-offset]')).find((element) => {
        const bounds = element.getBoundingClientRect();
        return event.clientX >= bounds.left && event.clientX <= bounds.right
          && event.clientY >= bounds.top && event.clientY <= bounds.bottom;
      });
      if (tile) return { targetOffset: Number(tile.dataset.tripDayOffset), targetId: null, placement: null };

      const days = Array.from(panel.querySelectorAll('[data-trip-day-offset]:not(.mr-daytile)'))
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

    // Al acercarse al borde de la lista, se desplaza siguiendo el arrastre.
    const scroller = scrollContainerFor(panel);
    const startScrollTop = scroller.scrollTop;
    let lastPointer = null;
    let scrollFrame = 0;

    const update = (pointer) => {
      const current = placeDragRef.current;
      if (!current) return;
      const next = {
        ...current,
        offsetY: pointer.clientY - current.startY + (scroller.scrollTop - startScrollTop),
        ...resolveTarget(pointer),
      };
      placeDragRef.current = next;
      setPlaceDrag(next);
    };

    const autoScroll = () => {
      scrollFrame = 0;
      if (!lastPointer || !placeDragRef.current) return;
      const step = dragScrollStep(lastPointer.clientY, scroller);
      if (!step) return;
      const before = scroller.scrollTop;
      scroller.scrollTop = before + step;
      if (scroller.scrollTop === before) return;
      update(lastPointer);
      scrollFrame = requestAnimationFrame(autoScroll);
    };

    const move = (event) => {
      event.preventDefault();
      if (!placeDragRef.current) return;
      lastPointer = { clientX: event.clientX, clientY: event.clientY };
      update(lastPointer);
      if (!scrollFrame) scrollFrame = requestAnimationFrame(autoScroll);
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
      if (scrollFrame) cancelAnimationFrame(scrollFrame);
      scrollFrame = 0;
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
      if (scrollFrame) cancelAnimationFrame(scrollFrame);
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
    const color = stopColor(number) || placeColor(place, segmentById, colors);
    const subtitle = placeSubtitle(place, segmentById);

    return (
      <SwipePlaceCard
        key={place.id}
        placeId={place.id}
        dragging={dragging}
        onTap={() => selectPlace?.(selected ? '' : place.id)}
        onLift={startPlaceDrag}
        onDelete={() => setPlaceToDelete(place)}
        deleteLabel={t('delete')}
      >
        {(offsetX) => (
          <article
            className={'mr-place' + (dragging ? ' is-dragging' : '') + (selected ? ' is-selected' : '') + dropClass}
            data-place-id={place.id}
            style={{
              '--mr-color': color,
              ...(dragging ? { '--mr-drag-y': `${placeDrag.offsetY}px` } : null),
              ...(offsetX ? { transform: `translateX(${offsetX}px)` } : null),
            }}
          >
            <span className="mr-place__move" data-place-move-menu>
              <button
                type="button"
                className={'mr-place__num mr-place__drag' + (number ? '' : ' mr-place__num--none')}
                onPointerDown={(event) => startPlaceDrag(event, place.id)}
                onClick={() => setMoveMenuPlaceId((current) => current === place.id ? '' : place.id)}
                aria-label={t('movePlace')}
                title={t('movePlace')}
              >
                {number || '·'}
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
            <span className="mr-place__text">
              <strong>{placeTitle(place, t)}</strong>
              {subtitle && <small>{subtitle}</small>}
            </span>
            <span className="mr-place__actions">
              <button
                type="button"
                className="mr-place__hover-delete"
                onClick={() => setPlaceToDelete(place)}
                aria-label={t('delete')}
                title={t('delete')}
              >
                <IconTrash size={17} stroke={1.8} aria-hidden="true" />
              </button>
              <button
                type="button"
                className={'mr-place__note' + (place.note ? ' has-note' : '')}
                onClick={() => setNotePlaceId(place.id)}
                aria-label={t('placeNote')}
                title={t('placeNote')}
              >
                <IconEdit size={19} stroke={1.8} aria-hidden="true" />
                {place.note && <span className="mr-place__note-dot" aria-hidden="true" />}
              </button>
            </span>
          </article>
        )}
      </SwipePlaceCard>
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

  function dayDistance(day) {
    if (!day.places.length) return '';
    const totals = dayRouteTotals(day.places, routeFor);
    return totals.distance ? formatDistance(totals.distance, intlLocale) : '';
  }

  // Día abierto: cabecera con bandera y ciudad grandes y, debajo,
  // "Día N · X lugares · Y km".
  function renderDayHead(day) {
    const cities = dayCities(day.assignments);
    const date = formatDayDate(day.date, intlLocale);
    const title = `${t('day')} ${day.globalDayNumber}`;
    const noteSegment = segmentById.get(day.assignments.at(-1)?.segmentId) || null;
    const distance = dayDistance(day);
    return (
      <div className="mr__dayhead">
        <div className="mr__dayhead-text">
          <div className="mr__dayhead-city">
            {cities.map((city, index) => {
              const flag = flagImageUrl(city.countryCode, 40);
              return (
                <Fragment key={city.name}>
                  {index > 0 && <span aria-hidden="true">·</span>}
                  {flag && <img src={flag} alt="" width={26} height={18} />}
                  <span>{city.name}</span>
                </Fragment>
              );
            })}
            {!cities.length && <span>{t('city')}</span>}
          </div>
          <div className="mr__dayhead-sub">
            <strong>{title}</strong>
            {` · ${t(day.places.length === 1 ? 'dayPlacesOne' : 'dayPlacesMany', { count: day.places.length })}`}
            {distance && ` · ${distance}`}
          </div>
        </div>
        {day.places.length > 0 && (
          <DayShareButton
            tripId={tripId}
            date={day.date}
            title={date ? `${title} · ${date}` : title}
            subtitle={dayCityNames(day.assignments)}
            cities={cities}
            places={day.places}
            routeFor={routeFor}
            colorFor={(place) => stopColor(day.places.indexOf(place) + 1) || placeColor(place, segmentById, colors)}
            t={t}
            intlLocale={intlLocale}
          />
        )}
        {noteSegment && (
          <button
            type="button"
            className={'mr__icon-btn mr__city-note' + (noteSegment.note ? ' has-note' : '')}
            onClick={() => toggleSegmentNote?.(noteSegment.id)}
            aria-label={t('segmentNote')}
            title={t('segmentNote')}
          >
            <IconEdit size={18} stroke={1.8} aria-hidden="true" />
          </button>
        )}
      </div>
    );
  }

  function renderDayTile(day, selected) {
    const dropTarget = placeDrag && placeDrag.targetOffset === day.tripDayOffset;
    const date = new Date(`${day.date}T00:00:00Z`);
    const valid = !Number.isNaN(date.getTime());
    const weekday = valid
      ? new Intl.DateTimeFormat(intlLocale || 'es-MX', { weekday: 'short', timeZone: 'UTC' }).format(date).replace('.', '')
      : '';
    const label = [`${t('day')} ${day.globalDayNumber}`, formatDayDate(day.date, intlLocale), dayCityNames(day.assignments)]
      .filter(Boolean).join(' · ');
    return (
      <button
        type="button"
        key={day.date}
        className={'mr-daytile'
          + (day.places.length ? ' has-places' : '')
          + (selected ? ' is-selected' : '')
          + (dropTarget ? ' is-drop-target' : '')}
        data-trip-day-offset={day.tripDayOffset}
        aria-pressed={selected}
        aria-label={label}
        title={label}
        onClick={() => setOpenDay(day.tripDayOffset)}
      >
        <small>{weekday}</small>
        <strong>{valid ? date.getUTCDate() : day.globalDayNumber}</strong>
        <i aria-hidden="true" />
      </button>
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

        <div className="mr__strip" ref={stripRef}>
          {allDays.map((day) => renderDayTile(day, day.tripDayOffset === selectedDay?.tripDayOffset))}
        </div>

        {selectedDay && (
          <section
            className={'mr__dayview' + (placeDrag && placeDrag.targetOffset === selectedDay.tripDayOffset ? ' is-drop-target' : '')}
            data-trip-day-offset={selectedDay.tripDayOffset}
          >
            {renderDayHead(selectedDay)}
            {renderDayBody(selectedDay)}
          </section>
        )}
        <p className="mr__hint mr__hint--touch">{t('placeListHint')}</p>
        <p className="mr__hint mr__hint--mouse">{t('placeListHintWeb')}</p>
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
