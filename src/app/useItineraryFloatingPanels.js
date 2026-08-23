import { useCallback, useMemo, useState } from 'react';
import { toggleTarget } from './appInteractionModel.js';
import { useOutsideClickSelector } from './useAppInteractions.js';

export function useItineraryFloatingPanels() {
  const [noteTarget, setNoteTarget] = useState(null);
  const [detailsTarget, setDetailsTarget] = useState(null);

  const close = useCallback(() => {
    setNoteTarget(null);
    setDetailsTarget(null);
  }, []);

  const toggleNote = useCallback((target) => {
    setDetailsTarget(null);
    setNoteTarget((current) => toggleTarget(current, target));
  }, []);

  const toggleDetails = useCallback((target) => {
    setNoteTarget(null);
    setDetailsTarget((current) => toggleTarget(current, target));
  }, []);

  useOutsideClickSelector('.segnote', Boolean(noteTarget || detailsTarget), close);

  return useMemo(() => ({
    noteTarget,
    detailsTarget,
    toggleNote,
    toggleDetails,
    close,
  }), [close, detailsTarget, noteTarget, toggleDetails, toggleNote]);
}
