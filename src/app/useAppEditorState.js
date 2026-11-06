import { useRef, useState } from 'react';
import { tripBreakdown } from '../modules/expenses/expenseModel.js';
import { tripTotal } from '../modules/trips/tripModel.js';
import { useCollapseSegmentsOnTripChange } from './useAppInteractions.js';

export function useAppEditorState(tripStore) {
  const { trip, addChecklistItem } = tripStore;
  const [expandedSegments, setExpandedSegments] = useState({});
  const [newItemText, setNewItemText] = useState('');
  const [confirmDeleteNote, setConfirmDeleteNote] = useState(null);
  const [showBreakdown, setShowBreakdown] = useState(false);
  const newItemRef = useRef(null);

  useCollapseSegmentsOnTripChange(trip.id, trip.segments, setExpandedSegments);

  function isExpanded(id) {
    return expandedSegments[id] !== false;
  }

  function toggleSegment(id) {
    setExpandedSegments((previous) => ({
      ...previous,
      [id]: previous[id] === false,
    }));
  }

  function handleAddItem(event) {
    event.preventDefault();
    const text = newItemText.trim();
    if (!text) return;
    addChecklistItem(text);
    setNewItemText('');
    newItemRef.current?.focus();
  }

  const checklist = trip.checklist || [];
  const total = tripTotal(trip);

  return {
    total,
    hasCosts: total > 0,
    breakdown: tripBreakdown(trip),
    checklist,
    doneCount: checklist.filter((item) => item.done).length,
    notes: trip.notes || [],
    places: trip.places || [],
    confirmDeleteNote,
    setConfirmDeleteNote,
    showBreakdown,
    setShowBreakdown,
    isExpanded,
    toggleSegment,
    handleAddItem,
    newItemRef,
    newItemText,
    setNewItemText,
  };
}