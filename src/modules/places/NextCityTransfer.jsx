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
  const rowStyle = (active) => ({
    display: 'grid',
    width: '100%',
    gridTemplateColumns: '22px minmax(0, 1fr) auto 14px',
    alignItems: 'center',
    gap: 10,
    minHeight: 46,
    padding: '0 14px',
    border: 0,
    borderTop: '1px solid #eef0f2',
    background: active ? '#f7f9fa' : '#ffffff',
    color: '#0b1f2c',
    font: '500 13px var(--font-body)',
    textAlign: 'left',
  });

  return (
    <section
      data-next-city-transfer
      aria-label={`${from.name} → ${to.name}`}
      style={{ border: '1px solid #e2e4e9', borderRadius: 12, background: '#ffffff', boxShadow: '0 4px 14px rgba(15, 23, 42, 0.06)', overflow: 'hidden' }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '12px 14px' }}>
        <span aria-hidden="true" style={{ display: 'flex', width: 38, height: 38, flex: '0 0 38px', alignItems: 'center', justifyContent: 'center', borderRadius: 10, background: '#0b1f2c', color: '#ffffff' }}>
          <TransferIcon size={19} stroke={1.8} />
        </span>
        <span style={{ minWidth: 0 }}>
          <strong style={{ display: 'block', fontSize: 14.5, fontWeight: 600 }}>{t('transferTo', { city: to.name })}</strong>
          <span style={{ display: 'block', marginTop: 2, color: '#5b6080', fontSize: 12 }}>
            {[
              `${formatKm(straightKm, intlLocale)} ${t('straightLineDistance')}`,
              likelyFlight ? t('transferLikelyFlight') : '',
            ].filter(Boolean).join(' · ')}
          </span>
        </span>
      </div>
      {!likelyFlight && (
        <>
          <button
            type="button"
            onClick={() => setShowTransit((current) => !current)}
            disabled={!state.transit}
            aria-expanded={showTransit}
            style={{ ...rowStyle(showTransit), cursor: state.transit ? 'pointer' : 'default' }}
          >
            <IconBus size={18} stroke={1.8} color="#3b4556" aria-hidden="true" />
            <span>{t('routeModeTransit')}</span>
            <strong style={{ fontWeight: 600 }}>{state.loading ? '…' : formatDuration(state.transit?.duration)}</strong>
            {state.transit
              ? (showTransit ? <IconChevronUp size={14} color="#667085" aria-hidden="true" /> : <IconChevronDown size={14} color="#667085" aria-hidden="true" />)
              : <span />}
          </button>
          {showTransit && state.transit && (
            <div style={{ padding: '4px 14px 12px 46px', background: '#f7f9fa' }}>
              <TransitDetails route={state.transit} locale={intlLocale} />
            </div>
          )}
          <div style={{ ...rowStyle(false), cursor: 'default' }}>
            <IconCar size={18} stroke={1.8} color="#3b4556" aria-hidden="true" />
            <span>{t('routeModeDrive')}</span>
            <strong style={{ fontWeight: 600 }}>{state.loading ? '…' : formatDuration(state.drive?.duration)}</strong>
            <span />
          </div>
        </>
      )}
    </section>
  );
}
