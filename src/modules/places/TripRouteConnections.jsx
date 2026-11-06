import { Fragment, useEffect, useMemo, useRef, useState } from 'react';
import {
  IconBike,
  IconBus,
  IconCar,
  IconCheck,
  IconChevronDown,
  IconChevronUp,
  IconRoute,
  IconWalk,
} from '@tabler/icons-react';
import { loadGooglePlaceLocations } from './googlePlacesClient.js';
import { requestGooglePlaceRoute } from '../routes/googleRouteClient.js';
import { requestSavedPlaceRoute } from '../routes/geoapifyRouteClient.js';
import {
  ensureLiveRoute,
  setLiveRoute,
  useLiveRoutesVersion,
  withLiveGeometry,
} from '../routes/liveRouteStore.js';
import { distanceKm } from '../trips/placePlanningAssignment.js';
import { isGooglePlaceReference, isPlaced } from '../trips/tripModel.js';
import { transferDepartureTime } from './cityTransferModel.js';
import { formatDistance } from './placesDayModel.js';
import { ROUTE_STROKES, routeStroke, transitItinerary, transitLineBadges, transitVehicleKey } from './routeConnectionStyle.js';

export const ROUTE_MODES = Object.freeze([
  { id: 'walk', labelKey: 'routeModeWalk', Icon: IconWalk },
  { id: 'transit', labelKey: 'routeModeTransit', Icon: IconBus },
  { id: 'drive', labelKey: 'routeModeDrive', Icon: IconCar },
  { id: 'bicycle', labelKey: 'routeModeBicycle', Icon: IconBike },
]);

const estimateCache = new Map();
const pendingEstimateCache = new Map();

export function formatDuration(value) {
  const minutes = Math.max(0, Math.round((Number(value) || 0) / 60));
  if (!minutes) return '—';
  if (minutes < 60) return `${minutes} min`;
  const hours = Math.floor(minutes / 60);
  const remaining = minutes % 60;
  if (hours < 24) return remaining ? `${hours} h ${remaining} min` : `${hours} h`;
  const days = Math.floor(hours / 24);
  const remainingHours = hours % 24;
  return remainingHours ? `${days} d ${remainingHours} h` : `${days} d`;
}

/** Hora de una salida o llegada, en la zona horaria de la estación si se conoce. */
export function formatTransitTime(value, locale, timeZone = '') {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  const options = { hour: '2-digit', minute: '2-digit', hourCycle: 'h23' };
  try {
    return new Intl.DateTimeFormat(locale, timeZone ? { ...options, timeZone } : options).format(date);
  } catch {
    return new Intl.DateTimeFormat(locale, options).format(date);
  }
}

function estimateKey(origin, destination, mode) {
  return `${origin.id}>${destination.id}:${mode}`;
}

async function cachedEstimate(origin, destination, mode) {
  const key = estimateKey(origin, destination, mode);
  if (estimateCache.has(key)) return estimateCache.get(key);
  if (pendingEstimateCache.has(key)) return pendingEstimateCache.get(key);

  const pending = requestSavedPlaceRoute(origin, destination, mode)
    .then((result) => {
      const estimate = {
        duration: Number(result.duration) || 0,
        distance: Number(result.distance) || 0,
      };
      estimateCache.set(key, estimate);
      return estimate;
    })
    .finally(() => pendingEstimateCache.delete(key));

  pendingEstimateCache.set(key, pending);
  return pending;
}

function googlePlaceId(place) {
  return isGooglePlaceReference(place) ? place.googlePlaceId : '';
}

async function resolveEstimatePair(origin, destination, signal) {
  if (isPlaced(origin) && isPlaced(destination)) return { origin, destination };

  const ids = [googlePlaceId(origin), googlePlaceId(destination)].filter(Boolean);
  if (!ids.length) throw new Error('No hay coordenadas para estimar este tramo.');

  const locations = await loadGooglePlaceLocations(ids, { signal });
  const byId = new Map(locations.map((location) => [location.placeId, location]));
  const locatedOrigin = isPlaced(origin)
    ? origin
    : { ...origin, ...byId.get(googlePlaceId(origin)) };
  const locatedDestination = isPlaced(destination)
    ? destination
    : { ...destination, ...byId.get(googlePlaceId(destination)) };

  if (!isPlaced(locatedOrigin) || !isPlaced(locatedDestination)) {
    throw new Error('No fue posible ubicar ambos lugares.');
  }
  return { origin: locatedOrigin, destination: locatedDestination };
}

// Horarios de transporte del día del viaje (9:00 local); si ya pasó, ahora.
function transitDeparture(date, origin) {
  return transferDepartureTime(date, origin?.lon) || new Date().toISOString();
}

function calculateRoute(origin, destination, mode, date) {
  return requestGooglePlaceRoute(
    origin,
    destination,
    mode,
    { departureTime: mode === 'transit' ? transitDeparture(date, origin) : '' }
  );
}

const styles = {
  wrap: { display: 'grid', gridTemplateColumns: '32px minmax(0, 1fr)', columnGap: 12, alignItems: 'stretch', position: 'relative' },
  body: { padding: '4px 0', minWidth: 0, position: 'relative' },
  trigger: (open) => ({
    display: 'inline-flex',
    maxWidth: '100%',
    alignItems: 'center',
    gap: 8,
    minHeight: 28,
    padding: '0 10px 0 8px',
    border: `1px solid ${open ? '#0b1f2c' : 'transparent'}`,
    borderRadius: 7,
    background: open ? '#ffffff' : '#f4f6f8',
    color: '#3b4556',
    font: '500 12px var(--font-body)',
    cursor: 'pointer',
    textAlign: 'left',
  }),
  pendingTrigger: (open) => ({
    display: 'inline-flex',
    alignItems: 'center',
    gap: 6,
    minHeight: 28,
    padding: '0 10px',
    border: `1px ${open ? 'solid #0b1f2c' : 'dashed #c9ced7'}`,
    borderRadius: 7,
    background: '#ffffff',
    color: '#5b6080',
    font: '500 12px var(--font-body)',
    cursor: 'pointer',
  }),
  strong: { fontWeight: 600, color: '#0b1f2c' },
  badge: (color, textColor = '#ffffff') => ({
    display: 'inline-flex',
    alignItems: 'center',
    height: 18,
    padding: '0 6px',
    borderRadius: 4,
    background: color,
    color: textColor || '#ffffff',
    fontSize: 11,
    fontWeight: 700,
    whiteSpace: 'nowrap',
  }),
  list: {
    position: 'absolute',
    zIndex: 40,
    top: 'calc(100% - 2px)',
    left: 0,
    width: 'min(262px, 100%)',
    margin: 0,
    padding: 4,
    listStyle: 'none',
    border: '1px solid #e2e4e9',
    borderRadius: 10,
    background: '#ffffff',
    boxShadow: '0 8px 24px rgba(15, 23, 42, 0.14)',
  },
  option: (selected) => ({
    display: 'grid',
    width: '100%',
    gridTemplateColumns: '20px minmax(0, 1fr) auto 16px',
    alignItems: 'center',
    gap: 10,
    height: 38,
    padding: '0 10px',
    border: 0,
    borderRadius: 7,
    background: selected ? '#f1f8f7' : 'transparent',
    color: '#0b1f2c',
    font: '500 13px var(--font-body)',
    textAlign: 'left',
    cursor: 'pointer',
  }),
  status: { display: 'block', padding: '6px 10px 4px', color: '#9a3412', fontSize: 11.5 },
};

function railStyle(stroke) {
  if (stroke.style === 'solid') {
    return { justifySelf: 'center', width: 4, borderRadius: 2, background: stroke.color, minHeight: 36 };
  }
  return {
    justifySelf: 'center',
    width: 0,
    minHeight: 36,
    borderLeft: `${stroke.style === 'dotted' ? 3 : 2}px ${stroke.style} ${stroke.color}`,
  };
}

export function TripRouteConnections({
  origin,
  destination,
  route,
  date = '',
  upsertRoute,
  removeRoute,
  t,
  intlLocale,
}) {
  useLiveRoutesVersion();
  const rootRef = useRef(null);
  const [open, setOpen] = useState(false);
  const [estimates, setEstimates] = useState({});
  const [estimating, setEstimating] = useState(false);
  const [loadingMode, setLoadingMode] = useState('');
  const [routeError, setRouteError] = useState(false);

  const chosen = route && route.visible !== false && ROUTE_MODES.some(({ id }) => id === route.mode)
    ? withLiveGeometry(route)
    : null;
  const chosenMode = chosen?.mode || '';
  const straightKm = isPlaced(origin) && isPlaced(destination) ? distanceKm(origin, destination) : 0;

  // El viaje guarda solo el modo: al abrir el día se recalcula la línea una vez por sesión.
  useEffect(() => {
    if (!chosenMode || chosen?.geometry) return;
    ensureLiveRoute(origin.id, destination.id, chosenMode, () =>
      calculateRoute(origin, destination, chosenMode, date)
    ).catch(() => {});
  }, [chosen?.geometry, chosenMode, date, destination, origin]);

  useEffect(() => {
    if (!open) return undefined;
    const close = (event) => {
      if (!rootRef.current?.contains(event.target)) setOpen(false);
    };
    const escape = (event) => {
      if (event.key === 'Escape') setOpen(false);
    };
    document.addEventListener('pointerdown', close);
    document.addEventListener('keydown', escape);
    return () => {
      document.removeEventListener('pointerdown', close);
      document.removeEventListener('keydown', escape);
    };
  }, [open]);

  // Las estimaciones (Geoapify) se piden solo al desplegar la lista.
  useEffect(() => {
    if (!open) return undefined;
    const controller = new AbortController();
    setEstimating(true);
    resolveEstimatePair(origin, destination, controller.signal)
      .then(async (resolved) => {
        const results = await Promise.allSettled(
          ROUTE_MODES.map(async ({ id }) => [id, await cachedEstimate(resolved.origin, resolved.destination, id)])
        );
        if (controller.signal.aborted) return;
        const next = {};
        results.forEach((result) => {
          if (result.status === 'fulfilled') next[result.value[0]] = result.value[1];
        });
        setEstimates(next);
      })
      .catch(() => {})
      .finally(() => {
        if (!controller.signal.aborted) setEstimating(false);
      });
    return () => controller.abort();
  }, [destination, open, origin]);

  async function selectMode(mode) {
    if (loadingMode) return;
    setRouteError(false);
    if (mode === chosenMode && chosen?.geometry) {
      setOpen(false);
      return;
    }
    setLoadingMode(mode);
    try {
      const calculated = await calculateRoute(origin, destination, mode, date);
      setLiveRoute(origin.id, destination.id, mode, calculated);
      upsertRoute?.({
        id: route?.id,
        fromPlaceId: origin.id,
        toPlaceId: destination.id,
        visible: true,
        ...calculated,
      });
      setOpen(false);
    } catch {
      setRouteError(true);
    } finally {
      setLoadingMode('');
    }
  }

  function clearMode() {
    if (route?.id) removeRoute?.(route.id);
    setOpen(false);
  }

  const badges = useMemo(() => transitLineBadges(chosen), [chosen]);
  const stroke = routeStroke(chosen);
  const ModeIcon = ROUTE_MODES.find(({ id }) => id === chosenMode)?.Icon || IconRoute;
  const departure = chosenMode === 'transit'
    ? formatTransitTime(chosen?.transitSteps?.[0]?.departureTime, intlLocale, chosen?.transitSteps?.[0]?.departureTimeZone)
    : '';
  const distanceLabel = formatDistance(chosen?.distance, intlLocale);
  const pairKey = `${origin.id}>${destination.id}`;

  return (
    <div className="trip-connection mr-connector" ref={rootRef} data-route-pair={pairKey} style={{ ...styles.wrap, zIndex: open ? 60 : 1 }}>
      <span aria-hidden="true" style={railStyle(stroke)} />
      <div style={styles.body}>
        {chosenMode ? (
          <button
            type="button"
            aria-haspopup="listbox"
            aria-expanded={open}
            onClick={() => setOpen((current) => !current)}
            style={styles.trigger(open)}
          >
            <ModeIcon size={15} stroke={1.8} aria-hidden="true" />
            {badges.map((badge) => (
              <LineBadge key={`${badge.label}:${badge.color}:${badge.icon}`} {...badge} />
            ))}
            <span>
              <strong style={styles.strong}>{chosen?.duration ? formatDuration(chosen.duration) : '…'}</strong>
              {chosenMode !== 'transit' && ` ${t(ROUTE_MODES.find(({ id }) => id === chosenMode).labelKey).toLowerCase()}`}
              {departure && ` · ${t('routeDeparts')} ${departure}`}
              {!departure && distanceLabel && ` · ${distanceLabel}`}
            </span>
            {open
              ? <IconChevronUp size={12} aria-hidden="true" />
              : <IconChevronDown size={12} aria-hidden="true" />}
          </button>
        ) : (
          <button
            type="button"
            aria-haspopup="listbox"
            aria-expanded={open}
            onClick={() => setOpen((current) => !current)}
            style={styles.pendingTrigger(open)}
          >
            <IconRoute size={14} stroke={1.8} aria-hidden="true" />
            {t('chooseHowToGetThere')}
            {Number.isFinite(straightKm) && straightKm > 0 && ` · ${formatDistance(straightKm * 1000, intlLocale)}`}
          </button>
        )}

        {open && (
          <ul role="listbox" aria-label={t('routeMode')} style={styles.list}>
            {ROUTE_MODES.map(({ id, labelKey, Icon }) => {
              const selected = id === chosenMode;
              const estimate = estimates[id];
              const loading = loadingMode === id;
              return (
                <li key={id} role="presentation">
                  <button
                    type="button"
                    role="option"
                    aria-selected={selected}
                    disabled={Boolean(loadingMode)}
                    onClick={() => selectMode(id)}
                    style={styles.option(selected)}
                  >
                    <Icon size={16} stroke={1.8} color="#3b4556" aria-hidden="true" />
                    <span>{t(labelKey)}</span>
                    <strong style={{ fontWeight: 600 }}>
                      {loading || (estimating && !estimate) ? '…' : formatDuration(estimate?.duration)}
                    </strong>
                    {selected ? <IconCheck size={16} color="#2a7d73" aria-hidden="true" /> : <span />}
                  </button>
                </li>
              );
            })}
            {chosenMode && (
              <li role="presentation" style={{ borderTop: '1px solid #eef0f2', marginTop: 4, paddingTop: 4 }}>
                <button type="button" role="option" aria-selected={false} onClick={clearMode} style={{ ...styles.option(false), color: '#5b6080' }}>
                  <IconRoute size={16} stroke={1.8} aria-hidden="true" />
                  <span>{t('routeModeNone')}</span>
                  <span />
                  <span />
                </button>
              </li>
            )}
            {routeError && <li role="presentation" style={styles.status}>{t('routeCalculationError')}</li>}
          </ul>
        )}
      </div>
    </div>
  );
}

/** Logo de la línea u operador (si Google lo da) y su nombre corto en el color oficial. */
export function LineBadge({ label = '', color, textColor, icon = '' }) {
  const [iconFailed, setIconFailed] = useState(false);
  const showIcon = Boolean(icon) && !iconFailed;
  if (!label && !showIcon) return null;
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
      {showIcon && (
        <img
          src={icon}
          alt=""
          width={16}
          height={16}
          loading="lazy"
          referrerPolicy="no-referrer"
          onError={() => setIconFailed(true)}
          style={{ display: 'block', width: 16, height: 16, objectFit: 'contain' }}
        />
      )}
      {label && <span style={styles.badge(color || ROUTE_STROKES.transit.color, textColor)}>{label}</span>}
    </span>
  );
}

const itineraryStyles = {
  list: { display: 'grid', gridTemplateColumns: '40px 14px minmax(0, 1fr)', columnGap: 8, fontSize: 12, color: '#3b4556' },
  time: { alignSelf: 'center', color: '#0b1f2c', fontWeight: 600, fontVariantNumeric: 'tabular-nums', textAlign: 'right' },
  dot: { alignSelf: 'center', justifySelf: 'center', width: 10, height: 10, boxSizing: 'border-box', borderRadius: '50%', border: '2px solid #0b1f2c', background: '#ffffff' },
  station: { alignSelf: 'center', minWidth: 0, padding: '3px 0', color: '#0b1f2c', fontWeight: 500, overflowWrap: 'anywhere' },
  rail: (color) => ({ justifySelf: 'center', width: 4, minHeight: 36, borderRadius: 2, background: color }),
  walkRail: { justifySelf: 'center', width: 0, minHeight: 22, borderLeft: '2px dotted #98a2b3' },
  ride: { display: 'flex', minWidth: 0, flexDirection: 'column', justifyContent: 'center', gap: 3, padding: '6px 0' },
  rideHead: { display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' },
  muted: { color: '#667085' },
};

/** Itinerario de transporte público: estaciones con su hora, tramos con su línea y transbordos. */
export function TransitDetails({ route, locale, t = (key) => key }) {
  const items = transitItinerary(route?.transitSteps);
  if (!items.length) return null;

  return (
    <div style={itineraryStyles.list}>
      {items.map((item, index) => {
        const key = `${item.type}:${index}`;
        if (item.type === 'stop') {
          return (
            <Fragment key={key}>
              <span style={itineraryStyles.time}>{formatTransitTime(item.time, locale, item.timeZone)}</span>
              <span aria-hidden="true" style={itineraryStyles.dot} />
              <span style={itineraryStyles.station}>{item.name}</span>
            </Fragment>
          );
        }
        if (item.type === 'transfer') {
          const wait = item.seconds ? formatDuration(item.seconds) : '';
          const label = item.walk ? t('transitWalkTransfer') : t('transitTransfer');
          return (
            <Fragment key={key}>
              <span />
              <span aria-hidden="true" style={itineraryStyles.walkRail} />
              <span style={{ ...itineraryStyles.muted, alignSelf: 'center' }}>{[label, wait].filter(Boolean).join(' · ')}</span>
            </Fragment>
          );
        }
        const { step } = item;
        const color = step.lineColor || ROUTE_STROKES.transit.color;
        const line = step.lineShortName || step.lineName || step.tripShortText || '';
        const vehicleKey = transitVehicleKey(step.vehicleType);
        const stops = Number(step.stopCount) || 0;
        const detail = [
          step.headsign ? t('transitTowards', { place: step.headsign }) : '',
          stops ? t(stops === 1 ? 'transitStopOne' : 'transitStopMany', { count: stops }) : '',
        ].filter(Boolean).join(' · ');
        return (
          <Fragment key={key}>
            <span />
            <span aria-hidden="true" style={itineraryStyles.rail(color)} />
            <span style={itineraryStyles.ride}>
              <span style={itineraryStyles.rideHead}>
                <LineBadge label={line} color={color} textColor={step.lineTextColor} icon={step.lineIcon} />
                <span style={{ color: '#0b1f2c' }}>
                  {[vehicleKey ? t(vehicleKey) : '', item.seconds ? formatDuration(item.seconds) : ''].filter(Boolean).join(' · ')}
                </span>
              </span>
              {detail && <span style={itineraryStyles.muted}>{detail}</span>}
            </span>
          </Fragment>
        );
      })}
    </div>
  );
}
