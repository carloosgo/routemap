import { useEffect, useMemo, useState } from 'react';
import {
  IconBike,
  IconBus,
  IconCar,
  IconChevronRight,
  IconExternalLink,
  IconRoute,
  IconWalk,
} from '@tabler/icons-react';
import { useTranslation } from '../i18n/index.jsx';
import { loadDayShare } from '../modules/share/dayShareRepository.js';
import { placeMapsUrl } from '../modules/share/dayRouteShare.js';
import { SharedDayMap } from './SharedDayMap.jsx';
import { SHARED_ITINERARY_STYLES } from './sharedItineraryStyles.js';
import { SHARED_DAY_STYLES } from './sharedDayStyles.js';

const MODES = Object.freeze({
  walk: { Icon: IconWalk, labelKey: 'routeModeWalk' },
  transit: { Icon: IconBus, labelKey: 'routeModeTransit' },
  drive: { Icon: IconCar, labelKey: 'routeModeDrive' },
  bicycle: { Icon: IconBike, labelKey: 'routeModeBicycle' },
});

function formatDuration(seconds) {
  const minutes = Math.max(0, Math.round((Number(seconds) || 0) / 60));
  if (!minutes) return '';
  if (minutes < 60) return `${minutes} min`;
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  return rest ? `${hours} h ${rest} min` : `${hours} h`;
}

function formatDistance(meters, locale) {
  const value = Number(meters) || 0;
  if (value <= 0) return '';
  if (value < 1000) return `${Math.round(value / 10) * 10} m`;
  return `${new Intl.NumberFormat(locale, { maximumFractionDigits: value < 10000 ? 1 : 0 }).format(value / 1000)} km`;
}

function safeNumber(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function cleanPlaces(model) {
  return (Array.isArray(model?.places) ? model.places : [])
    .map((place, index) => ({
      number: Number(place?.number) || index + 1,
      name: String(place?.name || ''),
      address: String(place?.address || ''),
      category: String(place?.category || ''),
      lat: safeNumber(place?.lat),
      lon: safeNumber(place?.lon),
      color: /^#[0-9a-f]{6}$/i.test(String(place?.color || '')) ? place.color : '#0e4f63',
      googlePlaceId: String(place?.googlePlaceId || ''),
    }))
    .filter((place) => place.lat !== null && place.lon !== null);
}

function safeMapsLink(value) {
  try {
    const url = new URL(String(value || ''));
    return url.protocol === 'https:' && url.hostname === 'www.google.com' && url.pathname.startsWith('/maps/')
      ? url.toString()
      : '';
  } catch {
    return '';
  }
}

function SharedState({ message, error = false, title }) {
  return (
    <main className="shared-itinerary shared-itinerary--state">
      <style>{SHARED_ITINERARY_STYLES}</style>
      <div className={'shared-itinerary__state-card' + (error ? ' shared-itinerary__state-card--error' : '')} role="status">
        {title ? <strong>{title}</strong> : <span className="shared-itinerary__spinner" aria-hidden="true" />}
        <p>{message}</p>
      </div>
    </main>
  );
}

/** Vista pública de un día de Mis rutas: mapa con la ruta, lugares y Google Maps. */
export default function SharedDayPage({ shareId }) {
  const { t, intlLocale: visitorLocale } = useTranslation();
  const [share, setShare] = useState(null);
  const [loadState, setLoadState] = useState('loading');

  useEffect(() => {
    let cancelled = false;
    setLoadState('loading');
    loadDayShare(shareId).then((result) => {
      if (cancelled) return;
      setShare(result);
      setLoadState(result ? 'ready' : 'missing');
    }).catch((error) => {
      console.error('[Shared day] load failed', error);
      if (!cancelled) setLoadState('error');
    });
    return () => {
      cancelled = true;
    };
  }, [shareId]);

  const model = share?.model || null;
  const locale = share?.intlLocale || visitorLocale;
  const places = useMemo(() => cleanPlaces(model), [model]);
  const legs = useMemo(() => (Array.isArray(model?.legs) ? model.legs : []), [model]);
  const links = useMemo(
    () => (Array.isArray(model?.mapsLinks) ? model.mapsLinks.map(safeMapsLink).filter(Boolean) : []),
    [model]
  );

  useEffect(() => {
    if (!model) return undefined;
    const previous = document.title;
    document.title = `${model.title || t('appName')} · ${t('appName')}`;
    return () => {
      document.title = previous;
    };
  }, [model, t]);

  if (loadState === 'loading') return <SharedState message={t('sharedDayLoading')} />;
  if (loadState === 'missing') return <SharedState error title={t('appName')} message={t('sharedDayMissing')} />;
  if (loadState === 'error' || !model) return <SharedState error title={t('appName')} message={t('sharedDayLoadError')} />;

  const totalDistance = legs.reduce((sum, leg) => sum + (Number(leg?.distance) || 0), 0);
  const totalDuration = legs.reduce((sum, leg) => sum + (Number(leg?.duration) || 0), 0);
  const summary = [
    t('sharedDayPlacesCount', { count: places.length }),
    formatDistance(totalDistance, locale),
    formatDuration(totalDuration),
  ].filter(Boolean).join(' · ');

  return (
    <main className="shared-itinerary shared-day">
      <style>{SHARED_ITINERARY_STYLES}</style>
      <style>{SHARED_DAY_STYLES}</style>
      <div className="shared-itinerary__shell">
        <header className="shared-itinerary__header">
          <div className="shared-itinerary__brand">{t('appName')}</div>
          <p className="shared-itinerary__readonly">{t('sharedReadOnly')}</p>
          <h1>{model.title || t('day')}</h1>
          {model.subtitle && <p className="shared-day__city">{model.subtitle}</p>}
          <p className="shared-day__summary">{summary}</p>
        </header>

        <section className="shared-itinerary__map-card" aria-label={t('mapRegion')}>
          <SharedDayMap places={places} legs={legs} unavailableLabel={t('sharedDayMapUnavailable')} />
        </section>

        {links.length > 0 && (
          <div className="shared-day__actions">
            {links.map((link, index) => (
              <a className="shared-day__maps-btn" href={link} target="_blank" rel="noreferrer" key={link}>
                <IconRoute size={18} aria-hidden="true" />
                <span>
                  {links.length > 1
                    ? t('sharedDayOpenMapsPart', { number: index + 1 })
                    : t('sharedDayOpenMaps')}
                </span>
              </a>
            ))}
          </div>
        )}

        <section className="shared-day__list" aria-label={t('places')}>
          {places.map((place, index) => {
            const leg = legs[index];
            const next = places[index + 1];
            const mode = MODES[leg?.mode] || null;
            const legText = mode
              ? [t(mode.labelKey), formatDuration(leg.duration), formatDistance(leg.distance, locale)].filter(Boolean).join(' · ')
              : '';
            const detail = [place.category, place.address].filter(Boolean).join(' · ');
            return (
              <div key={`${place.number}-${place.name}`}>
                <a className="shared-day__place" href={placeMapsUrl(place)} target="_blank" rel="noreferrer">
                  <span className="shared-day__num" style={{ background: place.color }} aria-hidden="true">{place.number}</span>
                  <span className="shared-day__text">
                    <strong>{place.name || t('place')}</strong>
                    {detail && <small>{detail}</small>}
                  </span>
                  <IconExternalLink size={16} className="shared-day__ext" aria-hidden="true" />
                </a>
                {next && (
                  <div className={'shared-day__leg' + (mode ? '' : ' is-empty')}>
                    {mode ? <mode.Icon size={15} aria-hidden="true" /> : <IconChevronRight size={15} aria-hidden="true" />}
                    <span>{legText || t('sharedDayNoMode')}</span>
                  </div>
                )}
              </div>
            );
          })}
        </section>
      </div>
    </main>
  );
}
