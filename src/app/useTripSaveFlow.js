import { useCallback, useEffect, useState } from 'react';
import { savedTripErrorTranslationKey } from '../modules/trips/savedTripOperations.js';
import { hasSavableRoute, TRIP_LIMITS } from '../modules/trips/tripModel.js';
import { sanitizeText } from '../shared/utils.js';

export function useTripSaveFlow({
  trip,
  loadTrip,
  stageTrip,
  saveTrip,
  persistence,
  showToast,
  t,
}) {
  const [tripNamePromptOpen, setTripNamePromptOpen] = useState(false);
  const [tripNameDraft, setTripNameDraft] = useState('');

  useEffect(() => {
    setTripNamePromptOpen(false);
    setTripNameDraft('');
  }, [trip.id]);

  const closeTripNamePrompt = useCallback(() => {
    setTripNamePromptOpen(false);
    setTripNameDraft('');
  }, []);

  const handleSave = useCallback(async () => {
    const currentName = sanitizeText(trip.name || '', TRIP_LIMITS.tripName).trim();
    const requestedName = currentName
      || sanitizeText(tripNameDraft, TRIP_LIMITS.tripName).trim();

    if (!requestedName) {
      if (tripNamePromptOpen) showToast(t('tripNameRequired'), 2500);
      setTripNamePromptOpen(true);
      return;
    }

    if (!hasSavableRoute(trip)) {
      showToast(t('saveRouteValidationError'), 2500);
      return;
    }

    const tripToSave = currentName
      ? trip
      : {
          ...trip,
          name: requestedName,
          updatedAt: new Date().toISOString(),
        };

    persistence.markSaving();
    await stageTrip(tripToSave, { remote: false }).catch(() => {});

    try {
      const savedTrip = await saveTrip(tripToSave);
      persistence.markSaved({ adoptNextTrip: true });
      loadTrip(savedTrip);
      setTripNamePromptOpen(false);
      setTripNameDraft('');
      showToast(t('saved'));
    } catch (error) {
      persistence.markSaveError(error);
      showToast(t(savedTripErrorTranslationKey(error, 'savePersistenceError')), 3500);
    }
  }, [loadTrip, persistence, saveTrip, showToast, stageTrip, trip, tripNameDraft, tripNamePromptOpen, t]);

  return {
    tripNamePromptOpen,
    tripNameDraft,
    setTripNameDraft,
    closeTripNamePrompt,
    handleSave,
  };
}
