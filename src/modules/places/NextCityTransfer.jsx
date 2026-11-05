import { useEffect, useState } from 'react';
import { IconBus, IconCar, IconChevronDown, IconChevronUp, IconPlane, IconRoute } from '@tabler/icons-react';
import { requestGooglePlaceRoute } from '../routes/googleRouteClient.js';
import { requestSavedPlaceRoute } from '../routes/geoapifyRouteClient.js';
import { distanceKm } from '../trips/placePlanningAssignment.js';
import { isPlaced } from '../trips/tripModel.js';
import { TransitDetails, formatDuration } from './TripRouteConnections.jsx';
import { LIKELY_FLIGHT_KM, transferDepartureTime } from './cityTransferModel.js';

const transferCache = new Map();

function transferKey(from, to, date) {
  return `${from.lat},${from.lon}>${to.lat},${to.lon}@${date}`;
}

async function loadTransfer(from, to, date) {
  const key = transferKey(from, to, date);
  if (transferCache.has(key)) return transferCache.get(key);
  const pending = Promise.allSettled([
    requestGooglePlaceRoute(from, to, 'transit', { departureTime: transferDepartureTime(date, from.lon) }),
    requestSavedPlaceRoute(from, to, 'drive'),
  ]).then(([transit, drive]) => ({
    transit: transit.status === 'fulfilled' ? transit.value : null,
    drive: drive.status === 'fulfilled' && drive.value.available !== false ? drive.value : null,
  }));
  transferCache.set(key, pending);
  pending.catch(() => transferCache.delete(key));
  return pending;
}

function formatKm(value, locale) {
  return `${new Intl.NumberFormat(locale, { maximumFractionDigits: 0 }).format(value)} km`;
}

export function NextCityTransfer({ from, to, date, t, intlLocale }) {
  const [state, setState] = useState({ loading: true, transit: null, drive: null });
  const [showTransit, setShowTransit] = useState(false);
  const located = isPlaced(from) && isPlaced(to);
  const straightKm = located ? distanceKm(from, to) : 0;
  const likelyFlight = straightKm > LIKELY_FLIGHT_KM;

  useEffect(() => {
    if (!located || likelyFlight) {
      setState({ loading: false, transit: null, drive: null });
      return undefined;
    }
    let active = true;
    setState({ loading: true, transit: null, drive: null });
    loadTransfer(from, to, date).then((result) => {
      if (active) setState({ loading: false, ...result });
    });
    return () => { active = false; };
  }, [date, from, likelyFlight, located, to]);

  if (!located) return null;

  const TransferIcon = likelyFlight ? IconPlane : IconRoute;
  const pill = {
    display: 'inline-flex',
    alignItems: 'center',
    gap: 7,
    minHeight: 28,
    padding: '0 10px 0 8px',
    border: 0,
    borderRadius: 7,
    background: '#f4f6f8',
    color: '#3b4556',
    font: '500 12px var(--font-body)',
  };

  // Traslado entre ciudades: una línea más del día, con el mismo riel que los tramos.
  return (
    <div
      data-next-city-transfer
      style={{ display: 'grid', gridTemplateColumns: '32px minmax(0, 1fr)', columnGap: 12, alignItems: 'stretch' }}
    >
      <span aria-hidden="true" style={{ justifySelf: 'center', width: 0, minHeight: 44, borderLeft: '2px dashed #0b1f2c', opacity: 0.55 }} />
      <div style={{ display: 'flex', minWidth: 0, flexDirection: 'column', gap: 6, padding: '8px 0' }}>
        <span style={{ display: 'flex', alignItems: 'center', gap: 8, color: '#3b4556', fontSize: 12.5 }}>
          <TransferIcon size={15} stroke={1.8} color="#0b1f2c" aria-hidden="true" />
          <span>
            <strong style={{ color: '#0b1f2c', fontWeight: 600 }}>{t('transferTo', { city: to.name })}</strong>
            {` · ${formatKm(straightKm, intlLocale)}`}
            {likelyFlight && ` · ${t('transferLikelyFlight')}`}
          </span>
        </span>
        {!likelyFlight && (
          <span style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
            <button
              type="button"
              onClick={() => setShowTransit((current) => !current)}
              disabled={!state.transit}
              aria-expanded={showTransit}
              aria-label={t('routeModeTransit')}
              title={t('routeModeTransit')}
              style={{ ...pill, cursor: state.transit ? 'pointer' : 'default', ...(showTransit ? { background: '#ffffff', boxShadow: 'inset 0 0 0 1px #0b1f2c' } : null) }}
            >
              <IconBus size={15} stroke={1.8} aria-hidden="true" />
              <strong style={{ color: '#0b1f2c', fontWeight: 600 }}>{state.loading ? '…' : formatDuration(state.transit?.duration)}</strong>
              {state.transit && (showTransit
                ? <IconChevronUp size={12} aria-hidden="true" />
                : <IconChevronDown size={12} aria-hidden="true" />)}
            </button>
            <span style={pill} aria-label={t('routeModeDrive')} title={t('routeModeDrive')}>
              <IconCar size={15} stroke={1.8} aria-hidden="true" />
              <strong style={{ color: '#0b1f2c', fontWeight: 600 }}>{state.loading ? '…' : formatDuration(state.drive?.duration)}</strong>
            </span>
          </span>
        )}
        {showTransit && state.transit && (
          <div style={{ paddingTop: 2 }}>
            <TransitDetails route={state.transit} locale={intlLocale} />
          </div>
        )}
      </div>
    </div>
  );
}
