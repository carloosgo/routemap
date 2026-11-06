import { useState } from 'react';
import App from '../App.jsx';
import { useTranslation } from '../i18n/index.jsx';
import { useFirebaseAuth } from '../infrastructure/firebase/useFirebaseAuth.js';
import './AuthScreen.css';

function GoogleMark() {
  return (
    <svg width="26" height="26" viewBox="0 0 48 48" aria-hidden="true">
      <path fill="#FFC107" d="M43.6 20.5H42V20H24v8h11.3C33.7 32.7 29.2 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.3-.1-2.4-.4-3.5z" />
      <path fill="#FF3D00" d="m6.3 14.7 6.6 4.8C14.7 15.1 19 12 24 12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 16.3 4 9.7 8.3 6.3 14.7z" />
      <path fill="#4CAF50" d="M24 44c5.2 0 9.9-2 13.4-5.2l-6.2-5.2C29.2 35.1 26.7 36 24 36c-5.2 0-9.6-3.3-11.3-7.9l-6.5 5C9.5 39.6 16.2 44 24 44z" />
      <path fill="#1976D2" d="M43.6 20.5H42V20H24v8h11.3c-.8 2.2-2.2 4.2-4.1 5.6l6.2 5.2C37 39.2 44 34 44 24c0-1.3-.1-2.4-.4-3.5z" />
    </svg>
  );
}

function AuthBackdrop() {
  return (
    <svg className="auth-screen__map" viewBox="0 0 1440 900" preserveAspectRatio="xMidYMid slice" aria-hidden="true">
      <rect width="1440" height="900" fill="#e6edf0" />
      <path d="M0 610 C260 550 420 660 680 590 S1120 490 1440 550 L1440 900 L0 900Z" fill="#dfe8e3" />
      <path d="M780 0 C830 190 720 300 880 420 S1120 610 1040 900 L1440 900 L1440 0Z" fill="#e9eee6" />
      <path d="M380 610 Q620 440 820 480 T1110 350" fill="none" stroke="#19a5d0" strokeWidth="2.5" strokeDasharray="3 5" strokeLinecap="round" />
      <circle cx="380" cy="610" r="6" fill="#e2725b" />
      <circle cx="820" cy="480" r="6" fill="#4f6df5" />
      <circle cx="1110" cy="350" r="6" fill="#2aa866" />
    </svg>
  );
}

function AtlasMark({ t }) {
  return (
    <div className="auth-screen__brand">
      <span className="auth-screen__brand-icon" aria-hidden="true">
        <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M9 4 3 7v13l6-3 6 3 6-3V4l-6 3-6-3z" />
          <path d="M9 4v13M15 7v13" />
        </svg>
      </span>
      <span className="auth-screen__brand-name">{t('appName')}</span>
    </div>
  );
}

export function SignInScreen({ auth, t }) {
  const [pending, setPending] = useState(false);
  const [failed, setFailed] = useState(false);

  async function handleSignIn() {
    if (pending) return;
    setPending(true);
    setFailed(false);
    try {
      await auth.signInWithGoogle();
    } catch {
      setFailed(true);
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="auth-screen">
      <AuthBackdrop />
      <main className="auth-screen__card">
        <AtlasMark t={t} />
        <div className="auth-screen__copy">
          <h1>{t('signInTitle')}</h1>
          <p>{t('signInSubtitle')}</p>
        </div>
        <button type="button" className="auth-screen__google" onClick={handleSignIn} disabled={pending}>
          <span className="auth-screen__google-mark"><GoogleMark /></span>
          <span>{t('continueWithGoogle')}</span>
        </button>
        {(failed || auth.error) && (
          <p className="auth-screen__error" role="alert">{t('signInError')}</p>
        )}
      </main>
    </div>
  );
}

/**
 * Atlas exige sesión: sin cuenta no se monta la app (ni mapa ni búsquedas).
 */
export default function AuthGate() {
  const { t } = useTranslation();
  const auth = useFirebaseAuth();

  if (auth.loading) {
    return (
      <div className="auth-screen auth-screen--loading" aria-busy="true" aria-label={t('checkingSession')}>
        <AtlasMark t={t} />
      </div>
    );
  }

  if (!auth.user) return <SignInScreen auth={auth} t={t} />;

  return <App auth={auth} />;
}
