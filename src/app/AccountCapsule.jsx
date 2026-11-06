import { IconLogout } from '@tabler/icons-react';

function initialsOf(user) {
  const source = (user?.displayName || user?.email || '').trim();
  if (!source) return '·';
  const words = source.split(/[\s@._-]+/).filter(Boolean);
  const letters = words.length > 1 ? words[0][0] + words[1][0] : Array.from(words[0] || source).slice(0, 2).join('');
  return letters.toLocaleUpperCase();
}

function firstName(user) {
  const name = (user?.displayName || '').trim();
  if (name) return name.split(/\s+/)[0];
  return (user?.email || '').split('@')[0];
}

export function AccountAvatar({ user, size = 'sm' }) {
  return (
    <span className={`account-avatar account-avatar--${size}`} aria-hidden="true">
      {user?.photoURL
        ? <img src={user.photoURL} alt="" referrerPolicy="no-referrer" />
        : initialsOf(user)}
    </span>
  );
}

/**
 * Cápsula de cuenta flotante sobre el mapa, encima de Guardar y del menú ⋯.
 * En móvil vive en la cabecera, a la izquierda del menú.
 */
export function AccountCapsule({ account, menuRef, open, onToggle, t }) {
  const user = account?.user;
  if (!user) return null;
  const label = firstName(user) || t('account');

  return (
    <div className="account-capsule" ref={menuRef}>
      <button
        type="button"
        className={'account-capsule__button' + (open ? ' is-active' : '')}
        aria-label={`${t('account')}: ${user.email || label}`}
        title={label}
        aria-expanded={open}
        aria-haspopup="menu"
        onClick={onToggle}
      >
        <AccountAvatar user={user} />
      </button>

      {open && (
        <div className="account-capsule__menu" role="menu">
          <div className="account-capsule__identity">
            <AccountAvatar user={user} size="md" />
            <span className="account-capsule__identity-copy">
              {user.displayName && <strong>{user.displayName}</strong>}
              {user.email && <span>{user.email}</span>}
            </span>
          </div>
          <div className="account-capsule__actions">
            <button type="button" role="menuitem" className="account-capsule__item" onClick={account.onSignOut}>
              <IconLogout size={17} aria-hidden="true" />
              <span>{t('signOut')}</span>
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
