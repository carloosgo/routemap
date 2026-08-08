import { useEffect, useRef, useState } from 'react';
import { IconDeviceFloppy, IconMap2, IconX } from '@tabler/icons-react';

export function AppTopbar({
  menuWrapRef,
  t,
  trip,
  renameTrip,
  handleSave,
  desktopPanelCollapsed = false,
}) {
  const [saveOpen, setSaveOpen] = useState(false);
  const [draftName, setDraftName] = useState(trip.name || '');
  const inputRef = useRef(null);
  const latestSaveRef = useRef(handleSave);

  useEffect(() => {
    latestSaveRef.current = handleSave;
  }, [handleSave]);

  useEffect(() => {
    if (!saveOpen) setDraftName(trip.name || '');
  }, [saveOpen, trip.name]);

  useEffect(() => {
    if (saveOpen) inputRef.current?.focus();
  }, [saveOpen]);

  useEffect(() => {
    if (desktopPanelCollapsed) setSaveOpen(false);
  }, [desktopPanelCollapsed]);

  function submitSave(event) {
    event.preventDefault();
    const name = draftName.trim();
    if (!name) {
      inputRef.current?.focus();
      return;
    }

    renameTrip(name);
    setSaveOpen(false);
    setTimeout(() => latestSaveRef.current(), 0);
  }

  return (
    <header className="topbar topbar--floating-only" ref={menuWrapRef}>
      <div className="topbar__brand" aria-label={t('appName')}>
        <div className="topbar__brand-icon">
          <IconMap2 size={14} aria-hidden="true" />
        </div>
        <span className="topbar__brand-name">{t('appName')}</span>
      </div>

      {!desktopPanelCollapsed && (
        <button
          type="button"
          className="topbar__save"
          onClick={() => {
            setDraftName(trip.name || '');
            setSaveOpen((open) => !open);
          }}
          aria-label={t('saveTrip')}
          title={t('saveTrip')}
        >
          <IconDeviceFloppy size={22} aria-hidden="true" />
        </button>
      )}

      {!desktopPanelCollapsed && saveOpen && (
        <form className="trip-save-popover" onSubmit={submitSave}>
          <div className="trip-save-popover__head">
            <span>{t('tripName')}</span>
            <button
              type="button"
              className="trip-save-popover__close"
              aria-label={t('cancel')}
              onClick={() => setSaveOpen(false)}
            >
              <IconX size={15} aria-hidden="true" />
            </button>
          </div>
          <div className="trip-save-popover__body">
            <input
              ref={inputRef}
              type="text"
              className="trip-save-popover__input"
              value={draftName}
              placeholder={t('tripNamePlaceholder')}
              onChange={(event) => setDraftName(event.target.value)}
              maxLength={80}
            />
            <button type="submit" className="trip-save-popover__submit">
              {t('saveTrip')}
            </button>
          </div>
        </form>
      )}

      {trip.name?.trim() && <div className="trip-name-pill">{trip.name}</div>}
    </header>
  );
}