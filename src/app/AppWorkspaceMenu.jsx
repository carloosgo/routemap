import {
  IconBookmark,
  IconBrandGoogle,
  IconCloudUpload,
  IconDotsVertical,
  IconLogout,
  IconPlus,
  IconTrash,
  IconUserCircle,
} from '@tabler/icons-react';
import { tripTotal } from '../modules/trips/tripModel.js';
import { formatMoney } from '../shared/utils.js';

export function AppWorkspaceMenu({
  tripStore,
  savedTrips,
  openMenu,
  setOpenMenu,
  handleOpenSavedTrip,
  setTripToDelete,
  account = null,
  intlLocale,
  t,
}) {
  const { trip, resetTrip } = tripStore;
  const { trips, loading } = savedTrips;

  return (
    <div className="editor-module__settings">
      <div className="editor-module__menu-anchor editor-module__workspace-anchor">
        <button
          type="button"
          className={'editor-module__more-button' +
            (openMenu === 'workspace' ? ' is-active' : '')}
          aria-label={t('moreOptions')}
          aria-expanded={openMenu === 'workspace'}
          onClick={() => setOpenMenu(openMenu === 'workspace' ? null : 'workspace')}
        >
          <IconDotsVertical size={18} aria-hidden="true" />
        </button>

        {openMenu === 'workspace' && (
          <div className="editor-module__more-menu" role="menu">
            {account && (
              <>
                <div className="editor-module__menu-heading">
                  <IconUserCircle size={17} aria-hidden="true" />
                  <span className="editor-module__account-label">
                    {account.user ? (account.user.email || account.user.displayName || t('account')) : t('account')}
                  </span>
                </div>
                {account.user ? (
                  <>
                    <button
                      type="button"
                      className="editor-module__menu-item"
                      onClick={account.onImportLocalTrips}
                    >
                      <IconCloudUpload size={17} aria-hidden="true" />
                      <span>{t('importLocalTrips')}</span>
                    </button>
                    <button
                      type="button"
                      className="editor-module__menu-item"
                      onClick={account.onSignOut}
                    >
                      <IconLogout size={17} aria-hidden="true" />
                      <span>{t('signOut')}</span>
                    </button>
                  </>
                ) : (
                  <button
                    type="button"
                    className="editor-module__menu-item"
                    disabled={account.loading}
                    onClick={account.onSignIn}
                  >
                    <IconBrandGoogle size={17} aria-hidden="true" />
                    <span>{t('continueWithGoogle')}</span>
                  </button>
                )}
                <div className="editor-module__menu-separator" />
              </>
            )}
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
