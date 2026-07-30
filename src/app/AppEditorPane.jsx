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
  { key: 'plane', label: 'Vuelos', Icon: IconPlane, color: '#e2725b' },
  { key: 'train', label: 'Tren', Icon: IconTrain, color: '#4f6df5' },
  { key: 'bus', label: 'Bus', Icon: IconBus, color: '#e08a17' },
  { key: 'taxiUber', label: 'Auto / Taxi', Icon: IconCar, color: '#5a8f3c' },
  { key: 'lodging', label: 'Hospedaje', Icon: IconBed, color: '#d4a017' },
  { key: 'food', label: 'Comidas', Icon: IconToolsKitchen2, color: '#2aa866' },
  { key: 'attractions', label: 'Atracciones', Icon: IconTicket, color: '#9b59b6' },
  { key: 'others', label: 'Otros', Icon: IconDots, color: '#9499ab' },
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
                  onToggle={() => toggleSegment(segment.id)}
                  onUpdate={(patch) => updateSegment(segment.id, patch)}
                  onUpdateExpenses={(expenses) => updateExpenses(segment.id, expenses)}
                  onRemove={() => removeSegment(segment.id)}
                  onOpenNote={() => setOpenNoteSegmentId(segment.id)}
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
                    {trip.segments.length} {trip.segments.length === 1 ? 'tramo' : 'tramos'}
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
                          <span className="brk-name">{category.label}</span>
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
                    aria-label="Título de la nota"
                  />
                  {notes.length > 1 &&
                    (confirmDeleteNote === note.id ? (
                      <span className="notes-confirm-delete">
                        <span className="notes-confirm-delete__text">¿Eliminar?</span>
                        <button
                          type="button"
                          className="notes-confirm-delete__yes"
                          onClick={() => {
                            removeNote(note.id);
                            setConfirmDeleteNote(null);
                          }}
                        >
                          Sí
                        </button>
                        <button
                          type="button"
                          className="notes-confirm-delete__no"
                          onClick={() => setConfirmDeleteNote(null)}
                        >
                          No
                        </button>
                      </span>
                    ) : (
                      <button
                        type="button"
                        className="notes-remove-btn"
                        aria-label="Eliminar nota"
                        onClick={() => setConfirmDeleteNote(note.id)}
                      >
                        <IconTrash size={13} aria-hidden="true" />
                      </button>
                    ))}
                </div>
                <textarea
                  className="notes-textarea"
                  maxLength={MAX_NOTES}
                  placeholder="Agrega notas, ideas, recordatorios o cualquier detalle…"
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
              + Agregar nota
            </button>

            <div className="notes-section">
              <div className="notes-section__header">
                <span className="notes-section__title">
                  <IconChecklist size={13} aria-hidden="true" /> Pendientes
                </span>
                {checklist.length > 0 && (
                  <span className="notes-section__count">
                    {doneCount} de {checklist.length} completados
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
                        aria-label={item.done ? 'Marcar como pendiente' : 'Marcar como hecho'}
                        onClick={() => toggleChecklistItem(item.id)}
                      >
                        {item.done && <IconX size={10} aria-hidden="true" />}
                      </button>
                      <span className="checklist__text">{item.text}</span>
                      <button
                        type="button"
                        className="checklist__remove"
                        aria-label="Eliminar"
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
                  placeholder="Nuevo pendiente…"
                  value={newItemText}
                  onChange={(event) => setNewItemText(event.target.value)}
                />
                <button
                  type="submit"
                  className="btn btn--icon checklist__submit"
                  aria-label="Agregar"
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
