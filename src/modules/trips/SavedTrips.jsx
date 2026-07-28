import { useState } from 'react';
import { IconX } from '@tabler/icons-react';
import { useTranslation } from '../../i18n/index.jsx';
import { formatMoney } from '../../shared/utils.js';
import { ConfirmDialog } from '../../components/ConfirmDialog.jsx';
import { tripTotal } from './tripModel.js';

// Panel de viajes guardados: consultar, abrir (editar) y eliminar.
export function SavedTrips({ trips, loading, currentId, onOpen, onDelete }) {
  const { t } = useTranslation();
  const [pendingId, setPendingId] = useState(null);
  const pendingTrip = trips.find((trip) => trip.id === pendingId) || null;

  return (
    <div className="saved">
      <h3 className="panel__title">{t('savedTrips')}</h3>
      {loading && <p className="muted">{t('loading')}</p>}
      {!loading && trips.length === 0 && <p className="muted">{t('noSavedTrips')}</p>}
      <ul className="saved__list">
        {trips.map((trip) => (
          <li
            key={trip.id}
            className={'saved__item' + (trip.id === currentId ? ' is-current' : '')}
          >
            <button type="button" className="saved__open" onClick={() => onOpen(trip)}>
              <span className="saved__name">{trip.name}</span>
              <span className="saved__meta">
                {trip.segments.length} {t('segments').toLowerCase()} ·{' '}
                {formatMoney(tripTotal(trip), trip.currency)}
              </span>
            </button>
            <button
              type="button"
              className="btn btn--icon"
              aria-label={t('delete')}
              onClick={() => setPendingId(trip.id)}
            >
              <IconX size={16} aria-hidden="true" />
            </button>
          </li>
        ))}
      </ul>

      <ConfirmDialog
        open={pendingId !== null}
        title={pendingTrip?.name}
        message={t('confirmDelete')}
        confirmLabel={t('delete')}
        cancelLabel={t('cancel')}
        onConfirm={() => {
          onDelete(pendingId);
          setPendingId(null);
        }}
        onCancel={() => setPendingId(null)}
      />
    </div>
  );
}
