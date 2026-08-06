export function TripDeleteDialog({ tripToDelete, setTripToDelete, onConfirm, t }) {
  if (!tripToDelete) return null;

  return (
    <div className="confirm__scrim" role="presentation" onMouseDown={() => setTripToDelete(null)}>
      <div
        className="confirm__card"
        role="dialog"
        aria-modal="true"
        aria-labelledby="confirm-delete-trip-title"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <h3 className="confirm__title" id="confirm-delete-trip-title">
          {t('deleteTrip')}
        </h3>
        <p className="confirm__message">
          {t('confirmDelete')}{' '}
          <strong>{tripToDelete.name || t('unnamedTrip')}</strong>
        </p>
        <div className="confirm__actions">
          <button
            type="button"
            className="btn btn--ghost btn--sm"
            onClick={() => setTripToDelete(null)}
          >
            {t('cancel')}
          </button>
          <button
            type="button"
            className="btn btn--danger btn--sm"
            onClick={onConfirm}
          >
            {t('delete')}
          </button>
        </div>
      </div>
    </div>
  );
}
