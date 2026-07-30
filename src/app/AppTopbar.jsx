import {
  IconBookmark,
  IconBrandGoogle,
  IconChevronDown,
  IconCloudUpload,
  IconCoin,
  IconDeviceFloppy,
  IconLanguage,
  IconLogout,
  IconMap,
  IconMap2,
  IconNotes,
  IconPlus,
  IconTrash,
  IconUser,
} from '@tabler/icons-react';
import { formatMoney } from '../shared/utils.js';
import { tripTotal } from '../modules/trips/tripModel.js';

const CURRENCIES = ['USD', 'EUR', 'MXN', 'GBP', 'JPY', 'CAD', 'BRL'];

export function AppTopbar({
  menuWrapRef,
  t,
  activeTab,
  setActiveTab,
  checklist,
  doneCount,
  trip,
  renameTrip,
  resetTrip,
  openMenu,
  setOpenMenu,
  trips,
  loading,
  loadTrip,
  deleteTrip,
  intlLocale,
  setCurrency,
  locale,
  availableLocales,
  setLocale,
  handleSave,
  canSave,
  authUser,
  authLoading,
  onGoogleSignIn,
  onSignOut,
  onImportLocalTrips,
}) {
  const accountLabel = authUser?.displayName || authUser?.email || t('account');

  return (
    <header className="topbar" ref={menuWrapRef}>
      <div className="topbar__brand">
        <div className="topbar__brand-icon">
          <IconMap2 size={17} aria-hidden="true" />
        </div>
        <span className="topbar__brand-name">{t('appName')}</span>
      </div>

      <input
        type="text"
        className="topbar__title"
        value={trip.name}
        placeholder={t('tripNamePlaceholder')}
        onChange={(event) => renameTrip(event.target.value)}
        aria-label={t('tripName')}
      />

      <span className="topbar__sep" />

      <div className="topbar__tabs">
        <button
          type="button"
          className={'topbar__tab' + (activeTab === 'segments' ? ' is-active' : '')}
          onClick={() => setActiveTab('segments')}
        >
          <IconMap size={15} aria-hidden="true" /> {t('segments')}
        </button>
        <button
          type="button"
          className={'topbar__tab' + (activeTab === 'notes' ? ' is-active' : '')}
          onClick={() => setActiveTab('notes')}
        >
          <IconNotes size={15} aria-hidden="true" /> {t('notes')}
          {checklist.length > 0 && (
            <span className="tabbar__badge">
              {doneCount}/{checklist.length}
            </span>
          )}
        </button>
      </div>

      <div className="topbar__spacer" />

      <button
        type="button"
        className="topitem topitem--accent"
        onClick={() => {
          resetTrip();
          setOpenMenu(null);
        }}
      >
        <IconPlus size={17} aria-hidden="true" /> {t('newTrip')}
      </button>

      <div className="topmenu">
        <button
          type="button"
          className="topitem"
          onClick={() => setOpenMenu(openMenu === 'trips' ? null : 'trips')}
        >
          <IconBookmark size={17} aria-hidden="true" /> {t('savedTrips')}
          <IconChevronDown size={13} className="topitem__chev" aria-hidden="true" />
        </button>
        {openMenu === 'trips' && (
          <div className="dropdown dropdown--trips">
            <div className="dropdown__label">{t('savedTrips')}</div>
            {loading ? (
              <div className="dropdown__empty">…</div>
            ) : trips.length === 0 ? (
              <div className="dropdown__empty">{t('noSavedTrips')}</div>
            ) : (
              trips.map((savedTrip) => {
                const segmentCount = savedTrip.segments?.length || 0;
                return (
                  <div
                    key={savedTrip.id}
                    className={'dropdown__trip' + (savedTrip.id === trip.id ? ' is-current' : '')}
                  >
                    <button
                      type="button"
                      className="dropdown__trip-open"
                      onClick={() => {
                        loadTrip(savedTrip);
                        setOpenMenu(null);
                      }}
                    >
                      <span className="dropdown__trip-name">
                        {savedTrip.name || t('unnamedTrip')}
                      </span>
                      <span className="dropdown__trip-meta">
                        {segmentCount}{' '}
                        {segmentCount === 1 ? t('segment').toLowerCase() : t('segmentPlural')}
                        {' · '}
                        {formatMoney(tripTotal(savedTrip), savedTrip.currency, intlLocale)}
                      </span>
                    </button>
                    <button
                      type="button"
                      className="dropdown__trip-del"
                      aria-label={t('deleteTrip')}
                      onClick={() => deleteTrip(savedTrip.id)}
                    >
                      <IconTrash size={15} aria-hidden="true" />
                    </button>
                  </div>
                );
              })
            )}
          </div>
        )}
      </div>

      <div className="topmenu">
        <button
          type="button"
          className="topitem"
          onClick={() => setOpenMenu(openMenu === 'currency' ? null : 'currency')}
        >
          <IconCoin size={17} aria-hidden="true" />
          <span className="topitem__val">{trip.currency}</span>
          <IconChevronDown size={13} className="topitem__chev" aria-hidden="true" />
        </button>
        {openMenu === 'currency' && (
          <div className="dropdown dropdown--mini">
            {CURRENCIES.map((currency) => (
              <button
                type="button"
                key={currency}
                className={'dropdown__opt' + (currency === trip.currency ? ' is-active' : '')}
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

      <div className="topmenu">
        <button
          type="button"
          className="topitem"
          onClick={() => setOpenMenu(openMenu === 'language' ? null : 'language')}
        >
          <IconLanguage size={17} aria-hidden="true" />
          <span className="topitem__val">{locale.toUpperCase()}</span>
          <IconChevronDown size={13} className="topitem__chev" aria-hidden="true" />
        </button>
        {openMenu === 'language' && (
          <div className="dropdown dropdown--mini">
            {availableLocales.map((availableLocale) => (
              <button
                type="button"
                key={availableLocale}
                className={'dropdown__opt' + (availableLocale === locale ? ' is-active' : '')}
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

      <div className="topmenu">
        {authUser ? (
          <>
            <button
              type="button"
              className="topitem"
              onClick={() => setOpenMenu(openMenu === 'account' ? null : 'account')}
              aria-label={t('account')}
            >
              <IconUser size={17} aria-hidden="true" />
              <span className="topitem__val">{accountLabel}</span>
              <IconChevronDown size={13} className="topitem__chev" aria-hidden="true" />
            </button>
            {openMenu === 'account' && (
              <div className="dropdown dropdown--mini">
                <div className="dropdown__label">{accountLabel}</div>
                <button type="button" className="dropdown__opt" onClick={onImportLocalTrips}>
                  <IconCloudUpload size={15} aria-hidden="true" /> {t('importLocalTrips')}
                </button>
                <button type="button" className="dropdown__opt" onClick={onSignOut}>
                  <IconLogout size={15} aria-hidden="true" /> {t('signOut')}
                </button>
              </div>
            )}
          </>
        ) : (
          <button
            type="button"
            className="topitem"
            onClick={onGoogleSignIn}
            disabled={authLoading}
          >
            <IconBrandGoogle size={17} aria-hidden="true" /> {t('continueWithGoogle')}
          </button>
        )}
      </div>

      <button
        type="button"
        className="topbar__save"
        onClick={handleSave}
        disabled={!canSave}
      >
        <IconDeviceFloppy size={15} aria-hidden="true" /> {t('saveTrip')}
      </button>
    </header>
  );
}
