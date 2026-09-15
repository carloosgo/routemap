import { useEffect, useMemo, useState } from 'react';
import { IconChevronDown, IconMapPin } from '@tabler/icons-react';
import { useTranslation } from '../i18n/index.jsx';
import { loadItineraryGoogleStaticMap } from '../modules/export/googleStaticMapClient.js';
import { composeItineraryStaticMap } from '../modules/export/itineraryStaticMapComposer.js';
import { loadItineraryShare } from '../modules/share/itineraryShareRepository.js';
import { formatMoney } from '../shared/utils.js';
import './SharedItineraryPage.css';

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

function mapObjectUrl(image) {
  const blob = new globalThis.Blob([image.bytes], { type: 'image/jpeg' });
  return globalThis.URL.createObjectURL(blob);
}

function SharedLoading({ message }) {
  return (
    <main className="shared-itinerary shared-itinerary--state">
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
  const [mapUrl, setMapUrl] = useState('');
  const [mapState, setMapState] = useState('idle');

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

  useEffect(() => {
    if (!model) return undefined;
    const previousTitle = document.title;
    document.title = `${model.name || t('appName')} · ${t('appName')}`;
    return () => {
      document.title = previousTitle;
    };
  }, [model, t]);

  useEffect(() => {
    if (!model) return undefined;
    let cancelled = false;
    let objectUrl = '';
    setMapState('loading');
    setMapUrl('');

    const language = String(displayLocale).toLowerCase().startsWith('en') ? 'en' : 'es';
    loadItineraryGoogleStaticMap(model, { language })
      .then((baseMap) => composeItineraryStaticMap(model, baseMap))
      .then((image) => {
        if (cancelled) return;
        objectUrl = mapObjectUrl(image);
        setMapUrl(objectUrl);
        setMapState('ready');
      })
      .catch((error) => {
        console.error('[Shared itinerary] map failed', error);
        if (!cancelled) setMapState('error');
      });

    return () => {
      cancelled = true;
      if (objectUrl) globalThis.URL.revokeObjectURL(objectUrl);
    };
  }, [displayLocale, model]);

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

  return (
    <main className="shared-itinerary">
      <div className="shared-itinerary__shell">
        <header className="shared-itinerary__header">
          <div className="shared-itinerary__brand">{t('appName')}</div>
          <p className="shared-itinerary__readonly">{t('sharedReadOnly')}</p>
          <h1>{model.name || t('unnamedTrip')}</h1>
          <div className="shared-itinerary__metrics" aria-label={t('tripMetrics')}>
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
        </header>

        <section className="shared-itinerary__map-card" aria-label={t('mapRegion')}>
          {mapState === 'loading' && (
            <div className="shared-itinerary__map-state" role="status">
              <span className="shared-itinerary__spinner" aria-hidden="true" />
              {t('sharedMapLoading')}
            </div>
          )}
          {mapState === 'error' && (
            <div className="shared-itinerary__map-state shared-itinerary__map-state--error">
              {t('sharedMapError')}
            </div>
          )}
          {mapUrl && (
            <img
              src={mapUrl}
              alt={t('mapRegion')}
              className="shared-itinerary__map-image"
            />
          )}
        </section>

        <section className="shared-itinerary__cities" aria-labelledby="shared-itinerary-cities-title">
          <div className="shared-itinerary__section-heading">
            <span className="shared-itinerary__section-icon" aria-hidden="true">
              <IconMapPin size={18} />
            </span>
            <h2 id="shared-itinerary-cities-title">{t('sharedCities')}</h2>
          </div>

          <div className="shared-itinerary__city-list">
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
        </section>
      </div>
    </main>
  );
}
