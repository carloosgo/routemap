import { useEffect, useMemo, useState } from 'react';
import { IconChevronDown, IconInfoCircle, IconMapPin } from '@tabler/icons-react';
import { useTranslation } from '../i18n/index.jsx';
import { RouteMap } from '../modules/map/RouteMap.jsx';
import { loadItineraryShare } from '../modules/share/itineraryShareRepository.js';
import { formatMoney } from '../shared/utils.js';
import { SHARED_ITINERARY_STYLES } from './sharedItineraryStyles.js';

function formatCompactDate(iso, locale) {
  if (!iso) return '';
  const date = new Date(`${iso}T00:00:00Z`);
  if (Number.isNaN(date.getTime())) return String(iso);
  try {
    return new Intl.DateTimeFormat(locale, {
      day: 'numeric',
      month: 'short',
      timeZone: 'UTC',
    }).format(date).replace(/\./g, '');
  } catch {
    return String(iso);
  }
}

function formatDateRange(startDate, endDate, locale, fallback = '—') {
  const start = formatCompactDate(startDate, locale);
  const end = formatCompactDate(endDate, locale);
  if (start && end && start !== end) return `${start} – ${end}`;
  return start || end || fallback;
}

function flagEmoji(countryCode) {
  const code = String(countryCode || '').trim().toUpperCase();
  if (!/^[A-Z]{2}$/.test(code)) return '';
  return Array.from(code, (letter) => String.fromCodePoint(127397 + letter.charCodeAt(0))).join('');
}

function safeColor(value) {
  const color = String(value || '').trim();
  return /^#[0-9a-f]{6}$/i.test(color) ? color : '#0e4f63';
}

function mapCity(city, fallbackId) {
  if (!city) return null;
  const lat = Number(city.lat);
  const lon = Number(city.lon);
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) return null;
  return {
    id: String(city.id || fallbackId || ''),
    name: String(city.name || ''),
    displayName: String(city.name || ''),
    country: String(city.country || ''),
    countryCode: String(city.countryCode || '').toUpperCase(),
    lat,
    lon,
  };
}

function sharedRouteModel(model) {
  const origin = model?.hasOrigin ? mapCity(model.origin, 'shared-origin') : null;
  const stops = Array.isArray(model?.stops) ? model.stops : [];
  const segments = stops.flatMap((stop, index) => {
    const destination = mapCity(stop, `shared-stop-${index + 1}`);
    if (!destination) return [];
    return [{
      id: String(stop.segmentId || `shared-segment-${index + 1}`),
      destination,
      expenses: {
        transport: {
          plane: 0,
          train: 0,
          bus: 0,
          taxiUber: 0,
        },
      },
    }];
  });
  return { origin, segments };
}

function SharedStyles() {
  return <style>{SHARED_ITINERARY_STYLES}</style>;
}

function SharedLoading({ message }) {
  return (
    <main className="shared-itinerary shared-itinerary--state">
      <SharedStyles />
      <div className="shared-itinerary__state-card" role="status" aria-live="polite">
        <span className="shared-itinerary__spinner" aria-hidden="true" />
        <p>{message}</p>
      </div>
    </main>
  );
}

function SharedError({ title, message }) {
  return (
    <main className="shared-itinerary shared-itinerary--state">
      <SharedStyles />
      <div className="shared-itinerary__state-card shared-itinerary__state-card--error">
        <strong>{title}</strong>
        <p>{message}</p>
      </div>
    </main>
  );
}

export default function SharedItineraryPage({ shareId }) {
  const { t, intlLocale: visitorLocale } = useTranslation();
  const [share, setShare] = useState(null);
  const [loadState, setLoadState] = useState('loading');
  const [infoOpen, setInfoOpen] = useState(false);
  const [citiesOpen, setCitiesOpen] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setLoadState('loading');
    loadItineraryShare(shareId).then((result) => {
      if (cancelled) return;
      if (!result) {
        setLoadState('missing');
        return;
      }
      setShare(result);
      setLoadState('ready');
    }).catch((error) => {
      console.error('[Shared itinerary] load failed', error);
      if (!cancelled) setLoadState('error');
    });
    return () => {
      cancelled = true;
    };
  }, [shareId]);

  const model = share?.model || null;
  const displayLocale = share?.intlLocale || visitorLocale;
  const routeModel = useMemo(() => sharedRouteModel(model), [model]);

  useEffect(() => {
    if (!model) return undefined;
    const previousTitle = document.title;
    document.title = `${model.name || t('appName')} · ${t('appName')}`;
    return () => {
      document.title = previousTitle;
    };
  }, [model, t]);

  const metrics = useMemo(() => {
    if (!model) return [];
    return [
      {
        key: 'dates',
        label: t('tripDates'),
        value: formatDateRange(model.summary?.startDate, model.summary?.endDate, displayLocale, t('noTripDates')),
        wide: true,
      },
      { key: 'total', label: t('grandTotal'), value: formatMoney(model.total, model.currency, displayLocale) },
      { key: 'countries', label: t('countries'), value: String(model.summary?.countries ?? 0) },
      { key: 'cities', label: t('cities'), value: String(model.summary?.destinations ?? model.stops?.length ?? 0) },
      { key: 'nights', label: t('totalNights'), value: String(model.summary?.nights ?? 0) },
    ];
  }, [displayLocale, model, t]);

  if (loadState === 'loading') return <SharedLoading message={t('sharedTripLoading')} />;
  if (loadState === 'missing') {
    return <SharedError title={t('appName')} message={t('sharedTripMissing')} />;
  }
  if (loadState === 'error' || !model) {
    return <SharedError title={t('appName')} message={t('sharedTripLoadError')} />;
  }

  const stops = Array.isArray(model.stops) ? model.stops : [];

  function toggleInfo() {
    setInfoOpen((open) => {
      const next = !open;
      if (next) setCitiesOpen(false);
      return next;
    });
  }

  function toggleCities() {
    setCitiesOpen((open) => {
      const next = !open;
      if (next) setInfoOpen(false);
      return next;
    });
  }

  return (
    <main className="shared-itinerary shared-itinerary--map-view">
      <SharedStyles />

      <section className="shared-itinerary__map" aria-label={t('mapRegion')}>
        <RouteMap
          origin={routeModel.origin}
          segments={routeModel.segments}
          places={[]}
          routeConnections={[]}
          viewMode="segments"
        />
      </section>

      <button
        type="button"
        className={`shared-itinerary__info-button${infoOpen ? ' is-open' : ''}`}
        aria-label={t('tripMetrics')}
        aria-expanded={infoOpen}
        aria-controls="shared-itinerary-trip-info"
        onClick={toggleInfo}
      >
        <IconInfoCircle size={24} stroke={1.9} aria-hidden="true" />
      </button>

      {infoOpen && (
        <section
          id="shared-itinerary-trip-info"
          className="shared-itinerary__info-panel"
          aria-label={t('tripMetrics')}
        >
          <div className="shared-itinerary__brand">{t('appName')}</div>
          <p className="shared-itinerary__readonly">{t('sharedReadOnly')}</p>
          <h1>{model.name || t('unnamedTrip')}</h1>
          <div className="shared-itinerary__metrics">
            {metrics.map((metric) => (
              <div
                key={metric.key}
                className={metric.wide ? 'shared-itinerary__metric shared-itinerary__metric--wide' : 'shared-itinerary__metric'}
              >
                <span>{metric.label}</span>
                <strong>{metric.value}</strong>
              </div>
            ))}
          </div>
        </section>
      )}

      <section
        className={`shared-itinerary__sheet${citiesOpen ? ' is-open' : ''}`}
        aria-labelledby="shared-itinerary-cities-title"
      >
        <button
          type="button"
          className="shared-itinerary__sheet-toggle"
          aria-expanded={citiesOpen}
          aria-controls="shared-itinerary-city-list"
          onClick={toggleCities}
        >
          <span className="shared-itinerary__sheet-grip" aria-hidden="true" />
          <span className="shared-itinerary__sheet-title">
            <span className="shared-itinerary__section-icon" aria-hidden="true">
              <IconMapPin size={18} />
            </span>
            <span id="shared-itinerary-cities-title">{t('sharedCities')}</span>
            <small>{stops.length}</small>
          </span>
          <IconChevronDown className="shared-itinerary__sheet-chevron" size={20} aria-hidden="true" />
        </button>

        {citiesOpen && (
          <div id="shared-itinerary-city-list" className="shared-itinerary__city-list">
            {stops.map((stop, index) => {
              const number = Number(stop.number) || index + 1;
              const date = formatDateRange(stop.startDate, stop.endDate, displayLocale);
              const flag = flagEmoji(stop.countryCode);
              return (
                <details className="shared-itinerary__city" key={`${number}-${stop.name}-${index}`}>
                  <summary>
                    <span
                      className="shared-itinerary__city-number"
                      style={{ background: safeColor(stop.color) }}
                      aria-hidden="true"
                    >
                      {number}
                    </span>
                    <span className="shared-itinerary__city-main">
                      <strong>{flag ? `${flag} ` : ''}{stop.name || t('city')}</strong>
                      <span>{date}</span>
                    </span>
                    <span className="shared-itinerary__city-cost">
                      <small>{t('sharedCityCost')}</small>
                      <strong>{formatMoney(stop.total, model.currency, displayLocale)}</strong>
                    </span>
                    <IconChevronDown className="shared-itinerary__chevron" size={18} aria-hidden="true" />
                  </summary>
                  <div className="shared-itinerary__city-note">
                    {String(stop.note || '').trim() || t('sharedNoNotes')}
                  </div>
                </details>
              );
            })}
          </div>
        )}
      </section>
    </main>
  );
}
