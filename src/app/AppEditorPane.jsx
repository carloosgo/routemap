import { useEffect, useState } from 'react';
import {
  IconChecklist,
  IconChevronDown,
  IconPlus,
  IconTrash,
  IconX,
  IconPlane,
  IconTrain,
  IconBus,
  IconCar,
  IconBed,
  IconToolsKitchen2,
  IconTicket,
  IconDots,
} from '@tabler/icons-react';
import { SegmentForm } from '../modules/trips/SegmentForm.jsx';
import { formatMoney } from '../shared/utils.js';

const MAX_NOTES = 2000;

const BREAKDOWN_CATS = [
  { key: 'plane', labelKey: 'flights', Icon: IconPlane, color: '#e2725b' },
  { key: 'train', labelKey: 'train', Icon: IconTrain, color: '#4f6df5' },
  { key: 'bus', labelKey: 'bus', Icon: IconBus, color: '#e08a17' },
  { key: 'taxiUber', labelKey: 'carTaxi', Icon: IconCar, color: '#5a8f3c' },
  { key: 'lodging', labelKey: 'lodging', Icon: IconBed, color: '#d4a017' },
  { key: 'food', labelKey: 'meals', Icon: IconToolsKitchen2, color: '#2aa866' },
  { key: 'attractions', labelKey: 'attractions', Icon: IconTicket, color: '#9b59b6' },
  { key: 'others', labelKey: 'others', Icon: IconDots, color: '#9499ab' },
];

export function AppEditorPane({
  activeTab,
  trip,
  intlLocale,
  isExpanded,
  toggleSegment,
  updateSegment,
  updateExpenses,
  removeSegment,
  reorderSegment,
  moveSegment,
  setOpenNoteSegmentId,
  addSegment,
  t,
  total,
  hasCosts,
  showBreakdown,
  setShowBreakdown,
  breakdown,
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
  const segmentCount = trip.segments.length;
  const [dragState, setDragState] = useState(null);

  useEffect(() => {
    if (!dragState) return undefined;

    function handlePointerMove(event) {
      const target = document
        .elementFromPoint(event.clientX, event.clientY)
        ?.closest('[data-segment-id]');
      const targetId = target?.dataset.segmentId || null;
      let placement = null;

      if (targetId && targetId !== dragState.segmentId) {
        const bounds = target.getBoundingClientRect();
        placement = event.clientY >= bounds.top + bounds.height / 2 ? 'after' : 'before';
      }

      setDragState((current) =>
        current
          ? {
              ...current,
              offsetY: event.clientY - current.startY,
              targetId,
              placement,
            }
          : current
      );
    }

    function handlePointerEnd() {
      setDragState((current) => {
        if (current?.targetId && current.placement) {
          reorderSegment(current.segmentId, current.targetId, current.placement);
        }
        return null;
      });
    }

    document.addEventListener('pointermove', handlePointerMove);
    document.addEventListener('pointerup', handlePointerEnd, { once: true });
    document.addEventListener('pointercancel', handlePointerEnd, { once: true });
    return () => {
      document.removeEventListener('pointermove', handlePointerMove);
      document.removeEventListener('pointerup', handlePointerEnd);
      document.removeEventListener('pointercancel', handlePointerEnd);
    };
  }, [dragState, reorderSegment]);

  function moveSegmentWithKeyboard(segmentId, offset) {
    moveSegment(segmentId, offset);
    window.requestAnimationFrame(() => {
      document.querySelector(`[data-reorder-handle="${CSS.escape(segmentId)}"]`)?.focus();
    });
  }

  return (
    <section className="editor">
      <div className="editor__body">
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
                  expanded={isExpanded(segment.id)}
                  dragging={dragState?.segmentId === segment.id}
                  dragOffsetY={dragState?.segmentId === segment.id ? dragState.offsetY : 0}
                  dropPlacement={
                    dragState?.targetId === segment.id ? dragState.placement : null
                  }
                  onToggle={() => toggleSegment(segment.id)}
                  onUpdate={(patch) => updateSegment(segment.id, patch)}
                  onUpdateExpenses={(expenses) => updateExpenses(segment.id, expenses)}
                  onRemove={() => removeSegment(segment.id)}
                  onOpenNote={() => setOpenNoteSegmentId(segment.id)}
                  onReorderPointerStart={(event) => {
                    if (event.pointerType === 'mouse' && event.button !== 0) return;
                    event.currentTarget.focus({ preventScroll: true });
                    event.preventDefault();
                    setDragState({
                      segmentId: segment.id,
                      startY: event.clientY,
                      offsetY: 0,
                      targetId: null,
                      placement: null,
                    });
                  }}
                  onReorderKeyDown={(event) => {
                    if (event.key !== 'ArrowUp' && event.key !== 'ArrowDown') return;
                    event.preventDefault();
                    moveSegmentWithKeyboard(segment.id, event.key === 'ArrowUp' ? -1 : 1);
                  }}
                />
              ))}
            </div>

            <button type="button" className="btn btn--add" onClick={addSegment}>
              + {t('addSegment')}
            </button>

            <div className="total">
              <button
                type="button"
                className="total__head"
                onClick={() => setShowBreakdown((value) => !value)}
                disabled={!hasCosts}
              >
                <span className="total__info">
                  <span className="total__label">{t('grandTotal')}</span>
                  <span className="total__meta">
                    {segmentCount}{' '}
                    {segmentCount === 1 ? t('segment').toLowerCase() : t('segmentPlural')}
                    {!hasCosts && ' · ' + t('noResults')}
                  </span>
                </span>
                <span className="total__value">
                  {formatMoney(total, trip.currency, intlLocale)}
                </span>
                {hasCosts && (
                  <IconChevronDown
                    size={18}
                    className={'total__chev' + (showBreakdown ? ' is-open' : '')}
                    aria-hidden="true"
                  />
                )}
              </button>

              {showBreakdown && hasCosts && (
                <div className="total__breakdown">
                  {BREAKDOWN_CATS.filter((category) => breakdown[category.key] > 0).map(
                    (category) => {
                      const amount = breakdown[category.key];
                      const percentage = Math.round((amount / total) * 100);
                      const Icon = category.Icon;
                      return (
                        <div className="brk-row" key={category.key}>
                          <span className="brk-icon">
                            <Icon size={18} style={{ color: category.color }} aria-hidden="true" />
                          </span>
                          <span className="brk-name">{t(category.labelKey)}</span>
                          <span className="brk-val">
                            {formatMoney(amount, trip.currency, intlLocale)}
                          </span>
                          <span className="brk-pct">{percentage}%</span>
                        </div>
                      );
                    }
                  )}
                </div>
              )}
            </div>
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
                  <span className="notes-section__count">
                    {note.text.length} / {MAX_NOTES}
                  </span>
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
                    <li
                      key={item.id}
                      className={'checklist__item' + (item.done ? ' is-done' : '')}
                    >
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
                <button
                  type="submit"
                  className="btn btn--icon checklist__submit"
                  aria-label={t('addItem')}
                >
                  <IconPlus size={16} aria-hidden="true" />
                </button>
              </form>
            </div>
          </div>
        )}
      </div>
    </section>
  );
}
