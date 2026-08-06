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

const dictionaries = { es, en };
const LOCALE_STORAGE_KEY = 'atlas:locale';
const localeMetadata = Object.freeze({
  es: { intlLocale: 'es-MX', label: 'ES' },
  en: { intlLocale: 'en-US', label: 'EN' },
});

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

function interpolate(template, variables) {
  if (!variables || typeof variables !== 'object') return template;
  return template.replace(/\{([a-zA-Z0-9_]+)\}/g, (match, key) =>
    Object.hasOwn(variables, key) ? String(variables[key]) : match
  );
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
    (key, variables) => {
      const dictionary = dictionaries[locale] || dictionaries.es;
      const template = dictionary[key] ?? dictionaries.es[key] ?? key;
      return interpolate(template, variables);
    },
    [locale]
  );

  const value = useMemo(
    () => ({
      locale,
      intlLocale: localeMetadata[locale]?.intlLocale || localeMetadata.es.intlLocale,
      setLocale,
      t,
      availableLocales: Object.keys(dictionaries),
      localeMetadata,
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
