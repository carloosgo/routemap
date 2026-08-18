import itineraryStartFlag from '../../assets/itinerary-start-flag.svg';
import { useTranslation } from '../../i18n/index.jsx';

export function ItineraryOrigin({ city }) {
  const { t } = useTranslation();
  const cityName = city?.name || city?.displayName || '';
  const country = city?.country || '';
  const placeLabel = [cityName, country].filter(Boolean).join(', ');

  return (
    <div className="itinerary-origin" aria-label={t('origin')}>
      <img
        className="itinerary-origin__flag"
        src={itineraryStartFlag}
        alt=""
        aria-hidden="true"
      />
      <span className="itinerary-origin__label">{t('origin')}</span>
      <span className={'itinerary-origin__place' + (!placeLabel ? ' is-empty' : '')}>
        {placeLabel || t('searchCity')}
      </span>
    </div>
  );
}
