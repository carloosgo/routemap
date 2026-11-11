import { useMemo } from 'react';
import {
  IconBookmark,
  IconDeviceFloppy,
  IconDots,
  IconPlus,
  IconShare,
  IconTrash,
} from '@tabler/icons-react';
import { buildItineraryPdfModel } from '../modules/export/itineraryPdfModel.js';
import { tripTotal } from '../modules/trips/tripModel.js';
import { formatMoney } from '../shared/utils.js';
import { useItineraryShare } from './ItineraryShareButton.jsx';

export function AppWorkspaceMenu({
  tripStore,
  savedTrips,
  openMenu,
  setOpenMenu,
  handleOpenSavedTrip,
  setTripToDelete,
  handleSave,
  showToast,
  intlLocale,
  t,
}) {
  const { trip, resetTrip } = tripStore;
  const { trips, loading } = savedTrips;
  const open = openMenu === 'workspace';
  // En la app (móvil) Guardar y Compartir viven en este menú; en escritorio
  // siguen como círculos sobre el mapa y estas opciones se ocultan por CSS.
  const shareModel = useMemo(() => (open ? buildItineraryPdfModel(trip) : null), [open, trip]);
  const { sharing, shareItinerary } = useItineraryShare({
    model: shareModel,
    intlLocale,
    onStatus: (message) => showToast?.(message, 3000),
    onError: (error) => showToast?.(
      t(error?.code === 'itinerary-share/auth-required' ? 'shareSignInRequired' : 'shareItineraryError'),
      3600
    ),
    t,
  });

  return (
    <div className="editor-module__settings">
      <div className="editor-module__menu-anchor editor-module__workspace-anchor">
        <button
          type="button"
          className={'editor-module__more-button' +
            (openMenu === 'workspace' ? ' is-active' : '')}
          aria-label={t('moreOptions')}
          title={t('tripsMenu')}
          aria-expanded={openMenu === 'workspace'}
          onClick={() => setOpenMenu(openMenu === 'workspace' ? null : 'workspace')}
        >
          <IconDots size={17} aria-hidden="true" />
          <span className="editor-module__more-label">{t('tripsMenu')}</span>
        </button>

        {openMenu === 'workspace' && (
          <div className="editor-module__more-menu" role="menu">
            <button
              type="button"
              className="editor-module__menu-item editor-module__menu-item--app"
              onClick={() => {
                setOpenMenu(null);
                handleSave?.();
              }}
            >
              <IconDeviceFloppy size={17} aria-hidden="true" />
              <span>{t('saveTrip')}</span>
            </button>
            <button
              type="button"
              className="editor-module__menu-item editor-module__menu-item--app"
              disabled={sharing || !shareModel}
              onClick={async () => {
                await shareItinerary();
                setOpenMenu(null);
              }}
            >
              <IconShare size={17} aria-hidden="true" />
              <span>{t('shareItinerary')}</span>
            </button>
            <button
              type="button"
              className="editor-module__menu-item"
              onClick={() => {
                resetTrip();
                setOpenMenu(null);
              }}
            >
              <IconPlus size={17} aria-hidden="true" />
              <span>{t('newTrip')}</span>
            </button>

            <div className="editor-module__menu-separator" />

            <div className="editor-module__menu-heading">
              <IconBookmark size={17} aria-hidden="true" />
              <span>{t('savedTrips')}</span>
            </div>
            <div className="editor-module__saved-list">
              {loading ? (
                <div className="editor-module__menu-empty">…</div>
              ) : trips.length === 0 ? (
                <div className="editor-module__menu-empty">{t('noSavedTrips')}</div>
              ) : (
                trips.map((savedTrip) => {
                  const segmentCount = savedTrip.segmentCount ?? savedTrip.segments?.length ?? 0;
                  const savedTotal = savedTrip.total ?? tripTotal(savedTrip);
                  return (
                    <div
                      key={savedTrip.id}
                      className={'editor-module__saved-item' +
                        (savedTrip.id === trip.id ? ' is-current' : '')}
                    >
                      <button
                        type="button"
                        className="editor-module__saved-open"
                        onClick={() => handleOpenSavedTrip(savedTrip)}
                      >
                        <span className="editor-module__saved-name">
                          {savedTrip.name || t('unnamedTrip')}
                        </span>
                        <span className="editor-module__saved-meta">
                          {segmentCount}{' '}
                          {segmentCount === 1
                            ? t('segment').toLowerCase()
                            : t('segmentPlural')}
                          {' · '}
                          {formatMoney(savedTotal, savedTrip.currency, intlLocale)}
                        </span>
                      </button>
                      <button
                        type="button"
                        className="editor-module__saved-delete"
                        aria-label={t('deleteTrip')}
                        onClick={() => setTripToDelete(savedTrip)}
                      >
                        <IconTrash size={14} aria-hidden="true" />
                      </button>
                    </div>
                  );
                })
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
