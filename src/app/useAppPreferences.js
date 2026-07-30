import { useEffect, useState } from 'react';
import { unitSystemForLocale } from '../shared/international.js';

const UNIT_STORAGE_KEY = 'atlas:unit-system';

function readUnitSystem(locale) {
  if (typeof window === 'undefined') return unitSystemForLocale(locale);
  try {
    const saved = window.localStorage.getItem(UNIT_STORAGE_KEY);
    return saved === 'metric' || saved === 'imperial' ? saved : unitSystemForLocale(locale);
  } catch {
    return unitSystemForLocale(locale);
  }
}

export function useUnitSystem(locale) {
  const [unitSystem, setUnitSystemState] = useState(() => readUnitSystem(locale));

  function setUnitSystem(next) {
    if (next !== 'metric' && next !== 'imperial') return;
    setUnitSystemState(next);
    try {
      window.localStorage.setItem(UNIT_STORAGE_KEY, next);
    } catch {
      // La preferencia sigue activa durante la sesión aunque el navegador bloquee storage.
    }
  }

  return { unitSystem, setUnitSystem };
}

export function useInstallPrompt() {
  const [installEvent, setInstallEvent] = useState(null);

  useEffect(() => {
    function onBeforeInstallPrompt(event) {
      event.preventDefault();
      setInstallEvent(event);
    }

    function onInstalled() {
      setInstallEvent(null);
    }

    window.addEventListener('beforeinstallprompt', onBeforeInstallPrompt);
    window.addEventListener('appinstalled', onInstalled);
    return () => {
      window.removeEventListener('beforeinstallprompt', onBeforeInstallPrompt);
      window.removeEventListener('appinstalled', onInstalled);
    };
  }, []);

  async function installApp() {
    if (!installEvent) return false;
    await installEvent.prompt();
    const choice = await installEvent.userChoice;
    if (choice?.outcome === 'accepted') setInstallEvent(null);
    return choice?.outcome === 'accepted';
  }

  return { canInstall: Boolean(installEvent), installApp };
}
