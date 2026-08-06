import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import es from '../src/i18n/es.js';
import en from '../src/i18n/en.js';
import { formatDate, formatMoney } from '../src/shared/utils.js';

const root = new URL('../', import.meta.url);
const read = (path) => readFile(new URL(path, root), 'utf8');

test('el proveedor reconstruye traducciones y metadatos cuando cambia el idioma', async () => {
  const provider = await read('src/i18n/index.jsx');
  const app = await read('src/App.jsx');

  assert.match(provider, /const t = useCallback\([\s\S]*?\[locale\]\s*\);/);
  assert.match(provider, /const value = useMemo\([\s\S]*?\[locale, setLocale, t\]\s*\);/);
  assert.match(provider, /document\.documentElement\.lang = locale/);
  assert.match(provider, /document\.title = translatedValue\(locale, 'documentTitle'\)/);
  assert.match(app, /const \{ t, locale, intlLocale, setLocale, availableLocales \} = useTranslation\(\)/);
  assert.match(app, /t=\{t\}/);
  assert.match(app, /intlLocale=\{intlLocale\}/);
});

test('fechas y monedas respetan es-MX y en-US', () => {
  const isoDate = '2026-12-05';
  const date = new Date(`${isoDate}T00:00:00`);
  const dateOptions = { day: '2-digit', month: 'short', year: 'numeric' };
  const esDate = formatDate(isoDate, 'es-MX');
  const enDate = formatDate(isoDate, 'en-US');

  assert.equal(esDate, date.toLocaleDateString('es-MX', dateOptions));
  assert.equal(enDate, date.toLocaleDateString('en-US', dateOptions));
  assert.notEqual(esDate, enDate);

  const amount = 1234.5;
  const moneyOptions = {
    style: 'currency',
    currency: 'MXN',
    maximumFractionDigits: 2,
  };
  const esMoney = formatMoney(amount, 'MXN', 'es-MX');
  const enMoney = formatMoney(amount, 'MXN', 'en-US');

  assert.equal(esMoney, new Intl.NumberFormat('es-MX', moneyOptions).format(amount));
  assert.equal(enMoney, new Intl.NumberFormat('en-US', moneyOptions).format(amount));
  assert.notEqual(esMoney, enMoney);
});

test('la búsqueda de ciudades usa el idioma activo y separa el caché por idioma', async () => {
  const hook = await read('src/modules/geocoding/useCitySearch.js');
  const client = await read('src/modules/geocoding/citySearchClient.js');

  assert.match(hook, /const \{ t, locale \} = useTranslation\(\)/);
  assert.match(hook, /language: locale/);
  assert.match(hook, /\[query, locale\]/);
  assert.match(hook, /abortRef\.current\.abort\(\)/);

  assert.match(client, /language = config\.defaultLocale/);
  assert.match(client, /const safeLanguage = normalizeLanguage\(language\)/);
  assert.match(client, /const cacheKey = `\$\{queryKey\}\|\$\{safeLanguage\}\|\$\{safeLimit\}`/);
  assert.match(client, /language: safeLanguage/);
});

test('placeholders y mensajes sensibles al idioma viven en los diccionarios', async () => {
  const calendar = await read('src/components/CalendarDateInput.jsx');
  const app = await read('src/App.jsx');

  assert.match(calendar, /const placeholder = t\('datePlaceholder'\)/);
  assert.equal(es.datePlaceholder, 'dd/mm/aaaa');
  assert.equal(en.datePlaceholder, 'mm/dd/yyyy');
  assert.match(app, /showToast\(t\('savedTripMissing'\), 3000\)/);
  assert.match(app, /showToast\(t\('openTripError'\), 3000\)/);
});
