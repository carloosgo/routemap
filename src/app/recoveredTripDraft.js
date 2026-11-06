import { segmentTotal } from '../modules/trips/tripModel.js';

function segmentHasNoTripData(segment, { allowOrigin = false } = {}) {
  return Boolean(
    segment
      && (allowOrigin || !segment.origin)
      && !segment.destination
      && !segment.startDate
      && !segment.endDate
      && !String(segment.note || '').trim()
      && segmentTotal(segment) === 0
  );
}

export function normalizeRecoveredDraft(draft) {
  const segments = Array.isArray(draft?.segments) ? draft.segments : [];
  if (segments.length <= 1) return draft;

  const hasPlaces = Array.isArray(draft?.places) && draft.places.length > 0;
  const hasRoutes = Array.isArray(draft?.routeConnections) && draft.routeConnections.length > 0;
  const hasChecklist = Array.isArray(draft?.checklist) && draft.checklist.length > 0;
  const hasNotes = Array.isArray(draft?.notes) && draft.notes.some((note) =>
    String(note?.title || '').trim() || String(note?.text || '').trim()
  );

  const starterOnly = segmentHasNoTripData(segments[0], { allowOrigin: true });
  const trailingRowsAreBlank = segments.slice(1).every((segment) =>
    segmentHasNoTripData(segment)
  );
  const canCollapseStarterDraft = starterOnly
    && trailingRowsAreBlank
    && !hasPlaces
    && !hasRoutes
    && !hasChecklist
    && !hasNotes;

  if (!canCollapseStarterDraft) return draft;

  // Compatibilidad con borradores locales creados por la UI anterior: conserva
  // el nombre y la ciudad de origen, pero elimina filas generadas sin datos.
  // Viajes con destino, fechas, gastos, notas, lugares o rutas no se modifican.
  return {
    ...draft,
    segments: [segments[0]],
  };
}
