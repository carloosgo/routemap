import { useCallback, useEffect, useMemo, useState } from 'react';
import { itineraryAssignmentsByDay, placeTripDayOffset } from '../modules/trips/globalTripDayPlanning.js';

/**
 * Día abierto y lugar elegido de Mis rutas, compartidos por la lista y el mapa.
 * `day` es undefined hasta que el panel elige el día inicial.
 */
export function usePlacesFocus({ tripId = '', segments = [], places = [], t }) {
  const [focus, setFocus] = useState({ day: undefined, placeId: '' });

  // Otro viaje: el panel vuelve a elegir su día inicial.
  useEffect(() => {
    setFocus({ day: undefined, placeId: '' });
  }, [tripId]);

  const setOpenDay = useCallback((day) => {
    setFocus({ day, placeId: '' });
  }, []);

  const selectPlace = useCallback((placeId) => {
    setFocus((current) => ({ ...current, placeId: placeId || '' }));
  }, []);

  const selectPlaceFromMap = useCallback((placeId) => {
    const place = places.find((candidate) => candidate.id === placeId);
    const offset = place ? placeTripDayOffset(place, segments) : null;
    setFocus((current) => ({ day: offset ?? current.day, placeId }));
  }, [places, segments]);

  const focusLabel = useMemo(() => {
    if (typeof focus.day !== 'number') return '';
    const assignments = itineraryAssignmentsByDay(segments).get(focus.day) || [];
    const city = assignments.at(-1)?.destination?.name || '';
    return [`${t('day')} ${focus.day + 1}`, city].filter(Boolean).join(' · ');
  }, [focus.day, segments, t]);

  return { focus, setOpenDay, selectPlace, selectPlaceFromMap, focusLabel };
}
