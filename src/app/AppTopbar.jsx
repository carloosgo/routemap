import { IconDeviceFloppy, IconX } from '@tabler/icons-react';

export function AppTopbar({
  t,
  handleSave,
  tripNamePromptOpen = false,
  tripNameDraft = '',
  setTripNameDraft,
  closeTripNamePrompt,
  tripNameMaxLength = 120,
}) {
  return (
    <div className="topbar topbar--floating-only">
      {tripNamePromptOpen && (
        <form
          className="trip-save-popover"
          aria-label={t('tripName')}
          onSubmit={(event) => {
            event.preventDefault();
            handleSave();
          }}
        >
          <div className="trip-save-popover__head">
            <span>{t('tripName')}</span>
            <button
              type="button"
              className="trip-save-popover__close"
              aria-label={t('cancel')}
              onClick={closeTripNamePrompt}
            >
              <IconX size={15} aria-hidden="true" />
            </button>
          </div>
          <div className="trip-save-popover__body">
            <input
              type="text"
              className="trip-save-popover__input"
              value={tripNameDraft}
              maxLength={tripNameMaxLength}
              placeholder={t('tripNamePlaceholder')}
              aria-label={t('tripName')}
              autoFocus
              onChange={(event) => setTripNameDraft?.(event.target.value)}
            />
            <button type="submit" className="trip-save-popover__submit">
              {t('saveTrip')}
            </button>
          </div>
        </form>
      )}

      <button
        type="button"
        className="topbar__save"
        onClick={handleSave}
        aria-label={t('saveTrip')}
        title={t('saveTrip')}
      >
        <IconDeviceFloppy size={22} aria-hidden="true" />
      </button>
    </div>
  );
}
