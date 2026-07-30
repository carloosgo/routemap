import {
  IconBrandGoogle,
  IconChevronDown,
  IconCloudUpload,
  IconDeviceFloppy,
  IconLogout,
  IconMap2,
  IconUser,
} from '@tabler/icons-react';

export function AppTopbar({
  menuWrapRef,
  t,
  trip,
  renameTrip,
  openMenu,
  setOpenMenu,
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
        style={{ marginLeft: 8 }}
        value={trip.name}
        placeholder={t('tripNamePlaceholder')}
        onChange={(event) => renameTrip(event.target.value)}
        aria-label={t('tripName')}
      />

      <div className="topbar__spacer" />

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
