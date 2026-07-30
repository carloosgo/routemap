import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from 'react';
import { config } from '../config.js';
import es from './es.js';
import en from './en.js';

// Módulo de internacionalización (independiente).
// Para agregar un idioma: crea xx.js y regístralo aquí. Nada más cambia.
const dictionaries = { es, en };
const LOCALE_STORAGE_KEY = 'atlas:locale';

const I18nContext = createContext(null);

function isSupportedLocale(locale) {
  return typeof locale === 'string' && Object.hasOwn(dictionaries, locale);
}

function getInitialLocale() {
  try {
    const storedLocale = globalThis.localStorage?.getItem(LOCALE_STORAGE_KEY);
    if (isSupportedLocale(storedLocale)) return storedLocale;
  } catch {
    // El almacenamiento puede estar bloqueado; usamos la configuración por defecto.
  }

  return isSupportedLocale(config.defaultLocale) ? config.defaultLocale : 'es';
}

export function I18nProvider({ children }) {
  const [locale, setLocaleState] = useState(getInitialLocale);

  const setLocale = useCallback((nextLocale) => {
    if (isSupportedLocale(nextLocale)) setLocaleState(nextLocale);
  }, []);

  useEffect(() => {
    try {
      globalThis.localStorage?.setItem(LOCALE_STORAGE_KEY, locale);
    } catch {
      // La preferencia sigue funcionando durante la sesión aunque no pueda persistirse.
    }

    if (globalThis.document?.documentElement) {
      globalThis.document.documentElement.lang = locale;
    }
  }, [locale]);

  const t = useCallback(
    (key) => {
      const dict = dictionaries[locale] || dictionaries.es;
      return dict[key] ?? key;
    },
    [locale]
  );

  const value = useMemo(
    () => ({
      locale,
      setLocale,
      t,
      availableLocales: Object.keys(dictionaries),
    }),
    [locale, setLocale, t]
  );

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

export function useTranslation() {
  const context = useContext(I18nContext);
  if (!context) throw new Error('useTranslation debe usarse dentro de <I18nProvider>');
  return context;
}
