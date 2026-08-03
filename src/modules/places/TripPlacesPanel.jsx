import { IconMapPin, IconTrash } from '@tabler/icons-react';
import { flagImageUrl } from '../flags/flags.js';
import './TripPlacesPanel.css';

function groupPlaces(places) {
  const groups = new Map();
  (places || []).forEach((place) => {
    const city = place.city || 'Sin ciudad';
    const country = place.country || place.countryCode || 'Sin país';
    const key = `${city}\u0000${country}`;
    if (!groups.has(key)) groups.set(key, { city, country, countryCode: place.countryCode, places: [] });
    groups.get(key).places.push(place);
  });
  return [...groups.values()];
}

function CountryFlag({ countryCode, country }) {
  if (!countryCode) return null;
  return (
    <img
      className="trip-places__flag"
      src={flagImageUrl(countryCode, 24)}
      alt={country || countryCode}
      width={24}
      height={16}
      loading="lazy"
    />
  );
}

export function TripPlacesPanel({ places, removePlace, t }) {
  const groups = groupPlaces(places);

  if (!groups.length) {
    return (
      <div className="trip-places trip-places--empty">
        <IconMapPin size={22} aria-hidden="true" />
        <strong>{t('noSavedPlaces')}</strong>
        <span>{t('savedPlacesHint')}</span>
      </div>
    );
  }

  return (
    <div className="trip-places">
      {groups.map((group) => (
        <section className="trip-places__group" key={`${group.city}-${group.country}`}>
          <header className="trip-places__group-head">
            <span className="trip-places__location">
              <CountryFlag countryCode={group.countryCode} country={group.country} />
              <strong>{group.city}</strong>
            </span>
            <span>{group.country}</span>
          </header>
          <div className="trip-places__list">
            {group.places.map((place) => (
              <article className="trip-place" key={place.id}>
                <span className="trip-place__pin"><IconMapPin size={15} aria-hidden="true" /></span>
                <span className="trip-place__info">
                  <strong>{place.name}</strong>
                  <small>{place.category || t('place')}</small>
                </span>
                <button type="button" onClick={() => removePlace(place.id)} aria-label={t('delete')}>
                  <IconTrash size={14} aria-hidden="true" />
                </button>
              </article>
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}
