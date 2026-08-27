import { useCallback, useEffect, useState } from 'react';
import { savedTripErrorTranslationKey } from '../modules/trips/savedTripOperations.js';
import { hasSavableRoute, TRIP_LIMITS } from '../modules/trips/tripModel.js';
import { sanitizeText } from '../shared/utils.js';

export function useTripSaveFlow({
  trip,
  renameTrip,
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

    if (!globalThis.confirm(t('confirmSaveTrip'))) return;

    const tripToSave = currentName
      ? trip
      : {
          ...trip,
          name: requestedName,
          updatedAt: new Date().toISOString(),
        };

    persistence.markSaving();
    if (!currentName) renameTrip(requestedName);
    await stageTrip(tripToSave, { remote: false }).catch(() => {});

    try {
      await saveTrip(tripToSave);
      persistence.markSaved();
      setTripNamePromptOpen(false);
      setTripNameDraft('');
      showToast(t('saved'));
    } catch (error) {
      persistence.markSaveError(error);
      showToast(t(savedTripErrorTranslationKey(error, 'savePersistenceError')), 3500);
    }
  }, [persistence, renameTrip, saveTrip, showToast, stageTrip, trip, tripNameDraft, tripNamePromptOpen, t]);

  return {
    tripNamePromptOpen,
    tripNameDraft,
    setTripNameDraft,
    closeTripNamePrompt,
    handleSave,
  };
}
