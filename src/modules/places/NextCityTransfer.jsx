import { useEffect, useState } from 'react';
import { IconBus, IconCar } from '@tabler/icons-react';
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

  return (
    <div className="trip-connection" data-next-city-transfer>
      <div className="trip-connection__transit">
        <div className="trip-connection__transit-step">
          <strong>{`${from.name} → ${to.name}`}</strong>
          <span>
            {[
              `${formatKm(straightKm, intlLocale)} ${t('straightLineDistance')}`,
              likelyFlight ? t('transferLikelyFlight') : '',
            ].filter(Boolean).join(' · ')}
          </span>
        </div>
      </div>
      {!likelyFlight && (
        <div className="trip-connection__modes" aria-label={t('routeMode')}>
          <button
            type="button"
            className={`trip-connection__mode${showTransit ? ' is-active' : ''}`}
            onClick={() => setShowTransit((current) => !current)}
            disabled={!state.transit}
            aria-pressed={showTransit}
            aria-label={t('routeModeTransit')}
            title={t('routeModeTransit')}
          >
            <IconBus size={16} stroke={1.8} aria-hidden="true" />
            <span>{state.loading ? '…' : formatDuration(state.transit?.duration)}</span>
          </button>
          <span className="trip-connection__mode" aria-label={t('routeModeDrive')} title={t('routeModeDrive')}>
            <IconCar size={16} stroke={1.8} aria-hidden="true" />
            <span>{state.loading ? '…' : formatDuration(state.drive?.duration)}</span>
          </span>
        </div>
      )}
      {showTransit && state.transit && <TransitDetails route={state.transit} locale={intlLocale} />}
    </div>
  );
}
