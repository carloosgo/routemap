import {
  IconBookmark,
  IconChevronDown,
  IconDotsVertical,
  IconLanguage,
  IconPlus,
  IconTrash,
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
  intlLocale,
  locale,
  setLocale,
  availableLocales,
  t,
}) {
  const { trip, resetTrip } = tripStore;
  const { trips, loading } = savedTrips;

  return (
    <div className="editor-module__settings">
      <div className="editor-module__menu-anchor">
        <button
          type="button"
          className={'editor-module__tab editor-module__nav-tab' +
            (openMenu === 'language' ? ' is-active' : '')}
          aria-label={t('language')}
          data-tab-icon="language-selector"
          onClick={() => setOpenMenu(openMenu === 'language' ? null : 'language')}
        >
          <span
            className="editor-module__tab-icon"
            aria-hidden="true"
            style={{ backgroundImage: 'none' }}
          >
            <IconLanguage style={{ display: 'block' }} />
          </span>
          <span className="editor-module__tab-label">{locale.toUpperCase()}</span>
          <IconChevronDown className="editor-module__tab-chevron" aria-hidden="true" />
        </button>
        {openMenu === 'language' && (
          <div
            className="editor-module__currency-menu editor-module__language-menu"
            aria-label={t('language')}
          >
            {availableLocales.map((availableLocale) => (
              <button
                type="button"
                key={availableLocale}
                className={'editor-module__currency-option editor-module__language-option' +
                  (availableLocale === locale ? ' is-active' : '')}
                onClick={() => {
                  setLocale(availableLocale);
                  setOpenMenu(null);
                }}
              >
                {availableLocale.toUpperCase()}
              </button>
            ))}
          </div>
        )}
      </div>

      <div className="editor-module__menu-anchor">
        <button
          type="button"
          className={'editor-module__more-button' +
            (openMenu === 'workspace' ? ' is-active' : '')}
          aria-label={t('moreOptions')}
          onClick={() => setOpenMenu(openMenu === 'workspace' ? null : 'workspace')}
        >
          <IconDotsVertical size={18} aria-hidden="true" />
        </button>

        {openMenu === 'workspace' && (
          <div className="editor-module__more-menu">
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
