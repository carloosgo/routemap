import { useState } from 'react';
import { IconMapPin, IconTrash } from '@tabler/icons-react';
import { flagImageUrl } from '../flags/flags.js';
import './TripPlacesPanel.css';

function groupPlaces(places, t) {
  const groups = new Map();
  (places || []).forEach((place) => {
    const city = place.city || t('noCity');
    const country = place.country || place.countryCode || t('noCountry');
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
  const [placeToDelete, setPlaceToDelete] = useState(null);
  const groups = groupPlaces(places, t);

  function confirmRemovePlace() {
    if (!placeToDelete) return;
    removePlace(placeToDelete.id);
    setPlaceToDelete(null);
  }

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
    <>
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
                  <button
                    type="button"
                    onClick={() => setPlaceToDelete(place)}
                    aria-label={t('delete')}
                  >
                    <IconTrash size={14} aria-hidden="true" />
                  </button>
                </article>
              ))}
            </div>
          </section>
        ))}
      </div>

      {placeToDelete && (
        <div className="confirm__scrim" role="presentation" onMouseDown={() => setPlaceToDelete(null)}>
          <div
            className="confirm__card"
            role="dialog"
            aria-modal="true"
            aria-label={t('deletePlace')}
            onMouseDown={(event) => event.stopPropagation()}
          >
            <p className="confirm__message">
              {t('confirmDeletePlace', { name: placeToDelete.name || t('place') })}
            </p>
            <div className="confirm__actions">
              <button
                type="button"
                className="btn btn--ghost btn--sm"
                onClick={() => setPlaceToDelete(null)}
              >
                {t('cancel')}
              </button>
              <button
                type="button"
                className="btn btn--danger btn--sm"
                onClick={confirmRemovePlace}
              >
                {t('delete')}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
