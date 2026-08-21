import { useEffect, useRef, useState } from 'react';
import {
  IconArrowRight,
  IconChecklist,
  IconChevronLeft,
  IconChevronRight,
  IconPlus,
  IconTrash,
  IconX,
} from '@tabler/icons-react';
import { SegmentForm } from '../modules/trips/SegmentForm.jsx';
import { flagImageUrl } from '../modules/flags/flags.js';
import { colorForIndex } from '../config.js';

const MAX_NOTES = 2000;

function CompactFlag({ city }) {
  if (!city?.countryCode) return <span className="compact-route__empty" aria-hidden="true" />;
  return (
    <img
      className="compact-route__flag"
      src={flagImageUrl(city.countryCode, 20)}
      alt={city.countryCode}
      width={20}
      height={14}
      loading="lazy"
    />
  );
}

export function AppEditorPane({
  activeTab,
  trip,
  intlLocale,
  isExpanded,
  toggleSegment,
  updateSegment,
  updateExpenses,
  updateOriginDetails,
  updateOriginExpenses,
  removeSegment,
  reorderSegment,
  setOpenNoteSegmentId,
  addSegment,
  t,
  notes,
  confirmDeleteNote,
  setConfirmDeleteNote,
  updateNote,
  removeNote,
  addNote,
  checklist,
  doneCount,
  toggleChecklistItem,
  removeChecklistItem,
  handleAddItem,
  newItemRef,
  newItemText,
  setNewItemText,
}) {
  const [dragState, setDragState] = useState(null);
  const dragStateRef = useRef(null);
  const [panelCollapsed, setPanelCollapsed] = useState(false);
  const activeDragId = dragState?.segmentId || null;

  useEffect(() => {
    if (!activeDragId) return undefined;

    function visibleDropCandidates(sourceId) {
      return Array.from(document.querySelectorAll('[data-segment-id]'))
        .map((element) => ({
          element,
          id: element.dataset.segmentId,
          bounds: element.getBoundingClientRect(),
        }))
        .filter(({ id, bounds }) => id && id !== sourceId && bounds.width > 0 && bounds.height > 0)
        .sort((left, right) => left.bounds.top - right.bounds.top);
    }

    function resolveDropTarget(event, sourceId) {
      const candidates = visibleDropCandidates(sourceId);
      if (candidates.length === 0) return { targetId: null, placement: null };
      const samePaneCandidates = candidates.filter(
        ({ bounds }) => event.clientX >= bounds.left && event.clientX <= bounds.right
      );
      const available = samePaneCandidates.length > 0 ? samePaneCandidates : candidates;
      const first = available[0];
      const last = available[available.length - 1];
      if (event.clientY <= first.bounds.top + first.bounds.height / 2) {
        return { targetId: first.id, placement: 'before' };
      }
      if (event.clientY >= last.bounds.top + last.bounds.height / 2) {
        return { targetId: last.id, placement: 'after' };
      }
      const nearest = available.reduce((best, candidate) => {
        const midpoint = candidate.bounds.top + candidate.bounds.height / 2;
        const distance = Math.abs(event.clientY - midpoint);
        return !best || distance < best.distance ? { candidate, distance } : best;
      }, null).candidate;
      return {
        targetId: nearest.id,
        placement:
          event.clientY >= nearest.bounds.top + nearest.bounds.height / 2 ? 'after' : 'before',
      };
    }

    function activeDragFor(event) {
      const current = dragStateRef.current;
      if (
        !current
        || current.segmentId !== activeDragId
        || current.pointerId !== event.pointerId
      ) {
        return null;
      }
      return current;
    }

    function clearActiveDrag() {
      dragStateRef.current = null;
      setDragState(null);
    }

    function handlePointerMove(event) {
      const current = activeDragFor(event);
      if (!current) return;
      const { targetId, placement } = resolveDropTarget(event, current.segmentId);
      const next = {
        ...current,
        offsetY: event.clientY - current.startY,
        targetId,
        placement,
      };
      dragStateRef.current = next;
      setDragState(next);
    }

    function handlePointerEnd(event) {
      const current = activeDragFor(event);
      if (!current) return;
      clearActiveDrag();
      if (current.targetId && current.placement) {
        reorderSegment(current.segmentId, current.targetId, current.placement);
      }
    }

    function handlePointerCancel(event) {
      if (!activeDragFor(event)) return;
      clearActiveDrag();
    }

    document.addEventListener('pointermove', handlePointerMove);
    document.addEventListener('pointerup', handlePointerEnd);
    document.addEventListener('pointercancel', handlePointerCancel);
    return () => {
      document.removeEventListener('pointermove', handlePointerMove);
      document.removeEventListener('pointerup', handlePointerEnd);
      document.removeEventListener('pointercancel', handlePointerCancel);
    };
  }, [activeDragId, reorderSegment]);

  return (
    <section className={'editor' + (panelCollapsed ? ' is-panel-collapsed' : '')}>
      <button
        type="button"
        className="editor-collapse-toggle"
        aria-label={panelCollapsed ? t('expand') : t('collapse')}
        title={panelCollapsed ? t('expand') : t('collapse')}
        onClick={() => setPanelCollapsed((value) => !value)}
      >
        {panelCollapsed ? (
          <IconChevronRight size={16} aria-hidden="true" />
        ) : (
          <IconChevronLeft size={16} aria-hidden="true" />
        )}
      </button>

      <div className="editor__body">
        {panelCollapsed ? (
          <div className="segments segments--compact" aria-label={t('segments')}>
            {trip.segments.map((segment, index) => (
              <div className="compact-route" key={segment.id}>
                <span
                  className="segment__badge compact-route__badge"
                  style={{ background: colorForIndex(index) }}
                  aria-hidden="true"
                >
                  {index + 1}
                </span>
                <CompactFlag city={segment.origin} />
                <IconArrowRight size={11} className="compact-route__arrow" aria-hidden="true" />
                <CompactFlag city={segment.destination} />
              </div>
            ))}
          </div>
        ) : (
          <>
            {activeTab === 'segments' && (
              <>
                <div className="segments">
                  {trip.segments.map((segment, index) => (
                    <SegmentForm
                      key={segment.id}
                      segment={segment}
                      index={index}
                      currency={trip.currency}
                      locale={intlLocale}
                      originDetails={trip.originDetails}
                      expanded={isExpanded(segment.id)}
                      dragging={dragState?.segmentId === segment.id}
                      dragOffsetY={dragState?.segmentId === segment.id ? dragState.offsetY : 0}
                      dropPlacement={dragState?.targetId === segment.id ? dragState.placement : null}
                      onToggle={() => toggleSegment(segment.id)}
                      onUpdate={(patch) => updateSegment(segment.id, patch)}
                      onUpdateExpenses={(expenses) => updateExpenses(segment.id, expenses)}
                      onUpdateOriginDetails={updateOriginDetails}
                      onUpdateOriginExpenses={updateOriginExpenses}
                      onRemove={() => removeSegment(segment.id)}
                      onOpenNote={(noteTarget = segment.id) => setOpenNoteSegmentId(noteTarget)}
                      onReorderPointerStart={(event) => {
                        if (event.pointerType === 'mouse' && event.button !== 0) return;
                        event.preventDefault();
                        event.currentTarget.setPointerCapture?.(event.pointerId);
                        const nextDragState = {
                          segmentId: segment.id,
                          pointerId: event.pointerId,
                          startY: event.clientY,
                          offsetY: 0,
                          targetId: null,
                          placement: null,
                        };
                        dragStateRef.current = nextDragState;
                        setDragState(nextDragState);
                      }}
                    />
                  ))}
                </div>

                <button type="button" className="btn btn--add" onClick={addSegment}>
                  + {t('addSegment')}
                </button>
              </>
            )}

            {activeTab === 'notes' && (
              <div className="notes-panel">
                {notes.map((note) => (
                  <div key={note.id} className="notes-section">
                    <div className="notes-section__header">
                      <input
                        type="text"
                        className="notes-title-input"
                        value={note.title}
                        maxLength={60}
                        placeholder={t('noteTitlePlaceholder')}
                        onChange={(event) => updateNote(note.id, 'title', event.target.value)}
                        aria-label={t('noteTitle')}
                      />
                      {notes.length > 1 &&
                        (confirmDeleteNote === note.id ? (
                          <span className="notes-confirm-delete">
                            <span className="notes-confirm-delete__text">{t('deleteQuestion')}</span>
                            <button
                              type="button"
                              className="notes-confirm-delete__yes"
                              onClick={() => {
                                removeNote(note.id);
                                setConfirmDeleteNote(null);
                              }}
                            >
                              {t('yes')}
                            </button>
                            <button
                              type="button"
                              className="notes-confirm-delete__no"
                              onClick={() => setConfirmDeleteNote(null)}
                            >
                              {t('no')}
                            </button>
                          </span>
                        ) : (
                          <button
                            type="button"
                            className="notes-remove-btn"
                            aria-label={t('deleteNote')}
                            onClick={() => setConfirmDeleteNote(note.id)}
                          >
                            <IconTrash size={13} aria-hidden="true" />
                          </button>
                        ))}
                    </div>
                    <textarea
                      className="notes-textarea"
                      maxLength={MAX_NOTES}
                      placeholder={t('notesPlaceholder')}
                      value={note.text}
                      onChange={(event) => updateNote(note.id, 'text', event.target.value)}
                    />
                    <div className="notes-section__footer">
                      <span className="notes-section__count">{note.text.length} / {MAX_NOTES}</span>
                    </div>
                  </div>
                ))}

                <button type="button" className="btn btn--add" onClick={addNote}>
                  + {t('addNote')}
                </button>

                <div className="notes-section">
                  <div className="notes-section__header">
                    <span className="notes-section__title">
                      <IconChecklist size={13} aria-hidden="true" /> {t('checklist')}
                    </span>
                    {checklist.length > 0 && (
                      <span className="notes-section__count">
                        {doneCount} {t('of')} {checklist.length} {t('completed')}
                      </span>
                    )}
                  </div>
                  {checklist.length > 0 && (
                    <ul className="checklist">
                      {checklist.map((item) => (
                        <li key={item.id} className={'checklist__item' + (item.done ? ' is-done' : '')}>
                          <button
                            type="button"
                            className={'checklist__check' + (item.done ? ' is-done' : '')}
                            aria-label={item.done ? t('markPending') : t('markDone')}
                            onClick={() => toggleChecklistItem(item.id)}
                          >
                            {item.done && <IconX size={10} aria-hidden="true" />}
                          </button>
                          <span className="checklist__text">{item.text}</span>
                          <button
                            type="button"
                            className="checklist__remove"
                            aria-label={t('delete')}
                            onClick={() => removeChecklistItem(item.id)}
                          >
                            <IconTrash size={13} aria-hidden="true" />
                          </button>
                        </li>
                      ))}
                    </ul>
                  )}
                  <form className="checklist__add" onSubmit={handleAddItem}>
                    <input
                      ref={newItemRef}
                      type="text"
                      className="input checklist__input"
                      placeholder={t('newChecklistItem')}
                      value={newItemText}
                      onChange={(event) => setNewItemText(event.target.value)}
                    />
                    <button type="submit" className="btn btn--icon checklist__submit" aria-label={t('addItem')}>
                      <IconPlus size={16} aria-hidden="true" />
                    </button>
                  </form>
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </section>
  );
}
