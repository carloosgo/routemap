import { CityAutocomplete } from '../../components/CityAutocomplete.jsx';
import { useTranslation } from '../../i18n/index.jsx';

export function ItineraryOrigin({ city, onSelect }) {
  const { t } = useTranslation();

  return (
    <div className="itinerary-origin" aria-label={t('origin')}>
      <span className="itinerary-origin__marker" aria-hidden="true" />
      <div className="itinerary-origin__place">
        <div className="itinerary-origin__picker">
          <CityAutocomplete
            value={city}
            onSelect={onSelect}
            placeholder={t('origin')}
          />
        </div>
        {city?.country && (
          <span className="itinerary-origin__country">{city.country}</span>
        )}
      </div>
    </div>
  );
}
