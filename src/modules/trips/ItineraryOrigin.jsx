import { CityAutocomplete } from '../../components/CityAutocomplete.jsx';
import { useTranslation } from '../../i18n/index.jsx';
import { flagImageUrl } from '../flags/flags.js';

export function ItineraryOrigin({ city, onSelect }) {
  const { t } = useTranslation();

  return (
    <div className="itinerary-origin" aria-label={t('origin')}>
      <span
        className={'itinerary-origin__marker' + (!city?.countryCode ? ' is-empty' : '')}
        aria-hidden="true"
      >
        {city?.countryCode ? (
          <img
            src={flagImageUrl(city.countryCode, 24)}
            alt=""
            width={24}
            height={17}
            loading="lazy"
          />
        ) : null}
      </span>
      <div className="itinerary-origin__place">
        <div className="itinerary-origin__picker">
          <CityAutocomplete
            value={city}
            onSelect={onSelect}
            placeholder={t('originPlaceholder')}
          />
        </div>
        {city?.country && (
          <span className="itinerary-origin__country">{city.country}</span>
        )}
      </div>
    </div>
  );
}
