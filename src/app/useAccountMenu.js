import { useCallback, useMemo } from 'react';

/**
 * Acciones de cuenta del menú ⋮: iniciar/cerrar sesión con Google e importar
 * los viajes guardados en este dispositivo a la cuenta (sincronización
 * ordenador ↔ iPhone).
 */
export function useAccountMenu({ auth, savedTrips, setOpenMenu, showToast, t }) {
  const { importLocalTrips, getLocalTripCount } = savedTrips;

  const onSignIn = useCallback(async () => {
    try {
      await auth.signInWithGoogle();
      setOpenMenu(null);
      showToast(t('signedIn'));
    } catch {
      showToast(t('signInError'), 3000);
    }
  }, [auth, setOpenMenu, showToast, t]);

  const onSignOut = useCallback(async () => {
    await auth.signOutUser();
    setOpenMenu(null);
    showToast(t('signedOut'));
  }, [auth, setOpenMenu, showToast, t]);

  const onImportLocalTrips = useCallback(async () => {
    const count = await getLocalTripCount();
    if (count === 0) {
      showToast(t('noLocalTrips'));
      return;
    }
    if (!globalThis.confirm(t('confirmImportLocalTrips'))) return;
    const imported = await importLocalTrips();
    setOpenMenu(null);
    showToast(`${t('importedTrips')}: ${imported}`);
  }, [getLocalTripCount, importLocalTrips, setOpenMenu, showToast, t]);

  return useMemo(() => ({
    user: auth.user,
    loading: auth.loading,
    onSignIn,
    onSignOut,
    onImportLocalTrips,
  }), [auth.loading, auth.user, onImportLocalTrips, onSignIn, onSignOut]);
}
