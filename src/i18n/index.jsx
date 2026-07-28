import { createContext, useContext, useMemo, useState, useCallback } from 'react';
import { config } from '../config.js';
import es from './es.js';
import en from './en.js';

// Módulo de internacionalización (independiente).
// Para agregar un idioma: crea xx.js y regístralo aquí. Nada más cambia.
const dictionaries = { es, en };

const I18nContext = createContext(null);

export function I18nProvider({ children }) {
  const [locale, setLocale] = useState(
    dictionaries[config.defaultLocale] ? config.defaultLocale : 'es'
  );

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
    [locale, t]
  );

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

export function useTranslation() {
  const ctx = useContext(I18nContext);
  if (!ctx) throw new Error('useTranslation debe usarse dentro de <I18nProvider>');
  return ctx;
}
