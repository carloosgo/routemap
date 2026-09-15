import { useCallback, useEffect, useState } from 'react';
import { onAuthStateChanged, signInWithPopup, signOut } from 'firebase/auth';
import { getFirebaseServices } from './firebaseClient.js';

function publicUser(user) {
  if (!user) return null;
  return {
    uid: user.uid,
    displayName: typeof user.displayName === 'string' ? user.displayName.trim() : '',
    email: typeof user.email === 'string' ? user.email.trim() : '',
  };
}

export function useFirebaseAuth() {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    let unsubscribe = () => {};
    try {
      const { auth } = getFirebaseServices();
      unsubscribe = onAuthStateChanged(
        auth,
        (nextUser) => {
          setUser(publicUser(nextUser));
          setLoading(false);
        },
        (authError) => {
          setError(authError instanceof Error ? authError.message : 'No se pudo comprobar la sesión.');
          setLoading(false);
        }
      );
    } catch (authError) {
      setError(authError instanceof Error ? authError.message : 'Firebase no está configurado.');
      setLoading(false);
    }
    return unsubscribe;
  }, []);

  const signInWithGoogle = useCallback(async () => {
    setError(null);
    const { auth, googleProvider } = getFirebaseServices();
    googleProvider.setCustomParameters({ prompt: 'select_account' });
    const credential = await signInWithPopup(auth, googleProvider);
    return publicUser(credential.user);
  }, []);

  const signOutUser = useCallback(async () => {
    setError(null);
    const { auth } = getFirebaseServices();
    await signOut(auth);
  }, []);

  return { user, loading, error, signInWithGoogle, signOutUser };
}
