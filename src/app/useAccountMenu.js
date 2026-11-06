import { useCallback, useMemo } from 'react';

/**
 * Cuenta de la cápsula sobre el mapa. El acceso con Google es obligatorio
 * (ver AuthGate), así que aquí sólo queda cerrar sesión. Los viajes se
 * guardan directamente en Firebase con la cuenta activa.
 */
export function useAccountMenu({ auth, setOpenMenu, showToast, t }) {
  const onSignOut = useCallback(async () => {
    setOpenMenu(null);
    await auth.signOutUser();
    showToast(t('signedOut'));
  }, [auth, setOpenMenu, showToast, t]);

  return useMemo(() => ({
    user: auth.user,
    onSignOut,
  }), [auth.user, onSignOut]);
}
