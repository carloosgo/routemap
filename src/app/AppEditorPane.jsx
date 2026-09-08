import {
  IconChecklist,
  IconPlus,
  IconTrash,
  IconX,
} from '@tabler/icons-react';

const MAX_NOTES = 2000;

export function AppEditorPane({
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
  return (
    <section className="editor">
      <div className="editor__body">
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
      </div>
    </section>
  );
}
