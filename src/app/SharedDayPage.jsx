import { useEffect, useMemo, useState } from 'react';
import {
  IconBike,
  IconBus,
  IconCar,
  IconExternalLink,
  IconRoute,
  IconWalk,
} from '@tabler/icons-react';
import { useTranslation } from '../i18n/index.jsx';
import { watchDayShare } from '../modules/share/dayShareRepository.js';
import { flagImageUrl } from '../modules/flags/flags.js';
import { placeMapsUrl } from '../modules/share/dayRouteShare.js';
import { transitVehicleKey } from '../modules/places/routeConnectionStyle.js';
import { countryColorForIndex } from '../config.js';
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

/** Primera letra en mayúscula (nombres de ciudades y lugares guardados en minúsculas). */
function capitalize(value, locale) {
  const text = String(value || '').trim();
  return text ? text.charAt(0).toLocaleUpperCase(locale) + text.slice(1) : '';
}

function safeNumber(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function cleanPlaces(model) {
  return (Array.isArray(model?.places) ? model.places : [])
    .map((place, index) => {
      const number = Number(place?.number) || index + 1;
      return {
        number,
        name: String(place?.name || ''),
        address: String(place?.address || ''),
        category: String(place?.category || ''),
        lat: safeNumber(place?.lat),
        lon: safeNumber(place?.lon),
        // Un color por número, igual que en Mis rutas (también en links antiguos).
        color: countryColorForIndex(number - 1),
        googlePlaceId: String(place?.googlePlaceId || ''),
      };
    })
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

function AtlasLogo() {
  return (
    <svg className="shared-day__logo" viewBox="0 0 512 512" width="22" height="22" aria-hidden="true">
      <rect width="512" height="512" rx="112" fill="#c9224d" />
      <path d="M116 144 220 104l76 34 100-38v268l-100 40-76-34-104 38V144Z" fill="none" stroke="#fff" strokeWidth="30" strokeLinejoin="round" />
      <path d="M220 104v270M296 138v270" stroke="#fff" strokeWidth="24" strokeLinecap="round" />
      <circle cx="296" cy="220" r="28" fill="#fff" />
    </svg>
  );
}

function LineBadge({ step }) {
  if (!step.line) return null;
  return (
    <span
      className="shared-day__line"
      style={{ background: step.color || '#0e4f63', color: step.textColor || '#ffffff' }}
    >
      {step.line}
    </span>
  );
}

/** Tramo entre dos lugares: nada si no hay ruta; líneas y estaciones en transporte. */
function SharedLeg({ leg, mode, legText, t }) {
  if (!mode) return <div className="shared-day__leg is-empty" aria-hidden="true" />;
  const steps = mode === MODES.transit && Array.isArray(leg?.steps) ? leg.steps : [];
  return (
    <div className="shared-day__leg">
      <div className="shared-day__leg-head">
        <mode.Icon size={15} aria-hidden="true" />
        <span>{legText}</span>
      </div>
      {steps.map((step, index) => {
        const vehicleKey = transitVehicleKey(step.vehicle);
        const stops = Number(step.stops) || 0;
        const route = [step.from, step.to].filter(Boolean).join(' → ');
        return (
          <div className="shared-day__step" key={`${index}-${step.line}-${step.from}`}>
            <div className="shared-day__step-head">
              <LineBadge step={step} />
              {vehicleKey && <span>{t(vehicleKey)}</span>}
              {stops > 0 && <small>{t(stops === 1 ? 'transitStopOne' : 'transitStopMany', { count: stops })}</small>}
            </div>
            {route && <p>{route}</p>}
          </div>
        );
      })}
    </div>
  );
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

  // En vivo: el link refleja los cambios recientes del día sin recargar.
  useEffect(() => {
    setLoadState('loading');
    return watchDayShare(
      shareId,
      (result) => {
        setShare(result);
        setLoadState(result ? 'ready' : 'missing');
      },
      (error) => {
        console.error('[Shared day] load failed', error);
        setLoadState('error');
      }
    );
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

  const cities = Array.isArray(model.cities) && model.cities.length
    ? model.cities
    : String(model.subtitle || '').split(' / ').filter(Boolean).map((name) => ({ name, countryCode: '' }));

  return (
    <main className="shared-itinerary shared-day">
      <style>{SHARED_ITINERARY_STYLES}</style>
      <style>{SHARED_DAY_STYLES}</style>
      <div className="shared-itinerary__shell">
        <header className="shared-itinerary__header shared-day__header">
          <div className="shared-day__brand">
            <AtlasLogo />
            <span className="shared-day__brand-name">{t('appName')}</span>
            <h1>{model.title || t('day')}</h1>
          </div>
          {cities.length > 0 && (
            <p className="shared-day__cities">
              {cities.map((city, index) => {
                const flag = flagImageUrl(city.countryCode, 40);
                return (
                  <span className="shared-day__city" key={`${city.name}-${index}`}>
                    {flag && <img src={flag} alt="" width={18} height={12} />}
                    {capitalize(city.name, locale)}
                  </span>
                );
              })}
              <small>{t('sharedDayPlacesCount', { count: places.length })}</small>
            </p>
          )}
        </header>

        <section className="shared-itinerary__map-card" aria-label={t('mapRegion')}>
          <SharedDayMap places={places} legs={legs} unavailableLabel={t('sharedDayMapUnavailable')} />
        </section>


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
                    <strong>{capitalize(place.name, locale) || t('place')}</strong>
                    {detail && <small>{detail}</small>}
                  </span>
                  <IconExternalLink size={16} className="shared-day__ext" aria-hidden="true" />
                </a>
                {next && <SharedLeg leg={leg} mode={mode} legText={legText} t={t} />}
              </div>
            );
          })}
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
      </div>
    </main>
  );
}
