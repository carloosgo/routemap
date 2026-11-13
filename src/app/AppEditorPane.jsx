import { useState } from 'react';
import {
  IconArrowRight,
  IconChecklist,
  IconChevronLeft,
  IconChevronRight,
  IconPlus,
  IconTrash,
  IconX,
} from '@tabler/icons-react';
import { MobileCityList } from '../modules/trips/MobileCityList.jsx';
import { buildItineraryStopSequence } from '../modules/trips/itineraryStopSequence.js';
import { segmentTotal } from '../modules/trips/tripModel.js';
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

function isPristineDestinationSegment(segment) {
  return Boolean(segment)
    && !segment.destination
    && !segment.startDate
    && !segment.endDate
    && !String(segment.note || '').trim()
    && segmentTotal(segment) === 0;
}

export function AppEditorPane({
  activeTab,
  trip,
  intlLocale,
  updateSegment,
  updateOrigin,
  removeSegment,
  reorderSegment,
  toggleNoteTarget,
  toggleDetailsTarget,
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
  const [panelCollapsed, setPanelCollapsed] = useState(false);
  const stopSequence = buildItineraryStopSequence(trip.origin, trip.segments, colorForIndex);
  const visibleSegmentEntries = trip.segments
    .map((segment, index) => ({ segment, index }))
    .filter(({ segment }) => !isPristineDestinationSegment(segment));

  function handleAddCity(city) {
    if (!city) return;
    const reusable = trip.segments.find(isPristineDestinationSegment);
    if (reusable) {
      updateSegment(reusable.id, { destination: city });
    } else {
      addSegment({ destination: city });
    }
  }

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
            {trip.segments.map((segment, index) => {
              const stop = stopSequence[index];
              const legOrigin = index === 0
                ? trip.origin
                : trip.segments[index - 1]?.destination || null;
              return (
                <div className="compact-route" key={segment.id}>
                  {stop?.number != null && (
                    <span
                      className="segment__badge compact-route__badge"
                      style={{ background: stop.color }}
                      aria-hidden="true"
                    >
                      {stop.number}
                    </span>
                  )}
                  <CompactFlag city={legOrigin} />
                  <IconArrowRight size={11} className="compact-route__arrow" aria-hidden="true" />
                  <CompactFlag city={segment.destination} />
                </div>
              );
            })}
          </div>
        ) : (
          <>
            {activeTab === 'segments' && (
              <MobileCityList
                trip={trip}
                entries={visibleSegmentEntries}
                stopSequence={stopSequence}
                locale={intlLocale}
                onUpdateOrigin={updateOrigin}
                onRemoveSegment={removeSegment}
                onReorderSegment={reorderSegment}
                onOpenNote={toggleNoteTarget}
                onOpenDetails={toggleDetailsTarget}
                onAddCity={handleAddCity}
              />
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
