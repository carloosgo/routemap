import { IconPennantFilled } from '@tabler/icons-react';
import { useTranslation } from '../../i18n/index.jsx';
import { TimelineCityPicker } from './TimelineCityPicker.jsx';

export function ItineraryOriginNode({ city, onSelect, placeholder }) {
  const { t } = useTranslation();
  return (
    <div className="itinerary-origin-node">
      <span className="itinerary-origin-node__marker" aria-hidden="true">
        <IconPennantFilled size={17} stroke={1.6} />
      </span>
      <div className="itinerary-origin-node__city">
        <TimelineCityPicker
          city={city}
          onSelect={onSelect}
          placeholder={placeholder || t('origin')}
        />
      </div>
    </div>
  );
}
