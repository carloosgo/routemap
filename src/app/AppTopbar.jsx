import {
  IconCloudUpload,
  IconLogin2,
  IconLogout,
  IconMap2,
  IconUserCircle,
} from '@tabler/icons-react';

export function AppTopbar({
  menuWrapRef,
  t,
  openMenu,
  setOpenMenu,
  authUser,
  authLoading,
  onGoogleSignIn,
  onSignOut,
  onImportLocalTrips,
}) {
  const accountLabel = authLoading
    ? t('loading')
    : authUser?.displayName || authUser?.email || t('account');

  return (
    <header className="topbar topbar--floating-only" ref={menuWrapRef}>
      <div className="topbar__brand" aria-label={t('appName')}>
        <div className="topbar__brand-icon">
          <IconMap2 size={14} aria-hidden="true" />
        </div>
        <span className="topbar__brand-name">{t('appName')}</span>
      </div>

      <div className="topbar__spacer" />

      <div
        className="topmenu"
        style={{ position: 'fixed', top: 7, right: 78, zIndex: 902 }}
      >
        <button
          type="button"
          className="topitem"
          onClick={() => setOpenMenu(openMenu === 'account' ? null : 'account')}
          disabled={authLoading}
          aria-expanded={openMenu === 'account'}
          aria-haspopup="menu"
        >
          <IconUserCircle size={20} aria-hidden="true" />
          <span className="topitem__val">{accountLabel}</span>
        </button>

        {openMenu === 'account' && (
          <div className="dropdown dropdown--trips" role="menu">
            {authUser ? (
              <>
                <div className="dropdown__label">
                  {authUser.displayName || authUser.email || t('account')}
                </div>
                {authUser.displayName && authUser.email && (
                  <div className="dropdown__label">{authUser.email}</div>
                )}
                <button
                  type="button"
                  className="dropdown__opt"
                  onClick={onImportLocalTrips}
                  role="menuitem"
                >
                  <IconCloudUpload size={16} aria-hidden="true" />{' '}
                  {t('importLocalTrips')}
                </button>
                <button
                  type="button"
                  className="dropdown__opt"
                  onClick={onSignOut}
                  role="menuitem"
                >
                  <IconLogout size={16} aria-hidden="true" />{' '}
                  {t('signOut')}
                </button>
              </>
            ) : (
              <button
                type="button"
                className="dropdown__opt"
                onClick={onGoogleSignIn}
                role="menuitem"
              >
                <IconLogin2 size={16} aria-hidden="true" />{' '}
                {t('continueWithGoogle')}
              </button>
            )}
          </div>
        )}
      </div>
    </header>
  );
}
