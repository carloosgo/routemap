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

const CURRENCIES = ['USD', 'EUR', 'MXN', 'GBP', 'JPY', 'CAD', 'BRL'];

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
  const { trip, resetTrip, setCurrency } = tripStore;
  const { trips, loading } = savedTrips;

  return (
    <div className="editor-sidebar__settings">
      <div className="editor-sidebar__menu-anchor">
        <button
          type="button"
          className={'editor-sidebar__item editor-sidebar__currency' +
            (openMenu === 'currency' ? ' is-active' : '')}
          aria-label={t('currency')}
          aria-expanded={openMenu === 'currency'}
          onClick={() => setOpenMenu(openMenu === 'currency' ? null : 'currency')}
        >
          <span className="editor-sidebar__icon" aria-hidden="true">
            <img src="/icons/moneda.svg" alt="" />
          </span>
          <span className="editor-sidebar__label">{trip.currency}</span>
          <IconChevronDown className="editor-sidebar__chevron" aria-hidden="true" />
        </button>

        {openMenu === 'currency' && (
          <div className="editor-module__currency-menu editor-sidebar__popover" aria-label={t('currency')}>
            {CURRENCIES.map((currency) => (
              <button
                type="button"
                key={currency}
                className={'editor-module__currency-option' +
                  (currency === trip.currency ? ' is-active' : '')}
                onClick={() => {
                  setCurrency(currency);
                  setOpenMenu(null);
                }}
              >
                {currency}
              </button>
            ))}
          </div>
        )}
      </div>

      <div className="editor-sidebar__menu-anchor editor-sidebar__menu-anchor--workspace">
        <button
          type="button"
          className={'editor-sidebar__utility' +
            (openMenu === 'workspace' ? ' is-active' : '')}
          aria-label={t('moreOptions')}
          aria-expanded={openMenu === 'workspace'}
          onClick={() => setOpenMenu(openMenu === 'workspace' ? null : 'workspace')}
        >
          <IconDotsVertical size={18} aria-hidden="true" />
        </button>

        {openMenu === 'workspace' && (
          <div className="editor-module__more-menu editor-sidebar__popover">
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

            <div className="editor-module__menu-separator" />

            <div className="editor-module__menu-heading">
              <IconLanguage size={17} aria-hidden="true" />
              <span>{t('language')}</span>
            </div>
            <div className="editor-module__language-options">
              {availableLocales.map((availableLocale) => (
                <button
                  type="button"
                  key={availableLocale}
                  className={'editor-module__language-option' +
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
          </div>
        )}
      </div>
    </div>
  );
}
