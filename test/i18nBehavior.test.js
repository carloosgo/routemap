// test-contract: architecture
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const root = new URL('../', import.meta.url);
const read = (path) => readFile(new URL(path, root), 'utf8');

test('el proveedor y los módulos reconstruyen su salida cuando cambia el idioma', async () => {
  const provider = await read('src/i18n/index.jsx');
  const app = await read('src/App.jsx');
  const editorModule = await read('src/app/AppEditorModule.jsx');
  const editorPane = await read('src/app/AppEditorPane.jsx');
  const segmentForm = await read('src/modules/trips/SegmentForm.jsx');
  const segmentBody = await read('src/modules/trips/SegmentBody.jsx');
  const originBody = await read('src/modules/trips/OriginBody.jsx');
  const expenseEditor = await read('src/modules/expenses/ExpenseEditor.jsx');
  const fixedExpenseCards = await read('src/modules/expenses/FixedExpenseCards.jsx');
  const lineItemsGrid = await read('src/modules/expenses/ExpenseLineItemsGrid.jsx');
  const moneyInput = await read('src/components/MoneyInput.jsx');

  assert.match(provider, /const t = useCallback\([\s\S]*?\[locale\]\s*\);/);
  assert.match(provider, /const value = useMemo\([\s\S]*?\[locale, setLocale, t\]\s*\);/);
  assert.match(provider, /document\.documentElement\.lang = locale/);
  assert.match(provider, /document\.title = translatedValue\(locale, 'documentTitle'\)/);

  assert.match(app, /const \{ t, locale, intlLocale, setLocale, availableLocales \} = useTranslation\(\)/);
  assert.match(app, /t=\{t\}/);
  assert.match(app, /intlLocale=\{intlLocale\}/);
  assert.match(editorModule, /intlLocale=\{intlLocale\}/);
  assert.match(editorPane, /locale=\{intlLocale\}/);
  assert.match(segmentForm, /locale=\{locale\}/);
  assert.match(segmentBody, /<CalendarDateInput[\s\S]*?locale=\{locale\}/);
  assert.match(segmentBody, /<ExpenseEditor[\s\S]*?currency=\{currency\}[\s\S]*?locale=\{locale\}/);
  assert.match(originBody, /<ExpenseEditor[\s\S]*?currency=\{currency\}[\s\S]*?locale=\{locale\}/);

  assert.match(expenseEditor, /ExpenseEditor\(\{ expenses, currency, locale, onChange \}\)/);
  assert.match(expenseEditor, /getCurrencySymbol\(currency, locale\)/);
  assert.match(expenseEditor, /<FixedExpenseCards[\s\S]*?currencySymbol=\{currencySymbol\}/);
  assert.match(expenseEditor, /<ExpenseLineItemsGrid[\s\S]*?currencySymbol=\{currencySymbol\}/);
  assert.match(fixedExpenseCards, /<MoneyCard[\s\S]*?currencySymbol=\{currencySymbol\}/);
  assert.match(lineItemsGrid, /moneycard__currency">\{currencySymbol\}<\/span>/);
  assert.match(moneyInput, /moneycard__currency">\{currencySymbol\}<\/span>/);
  assert.doesNotMatch(lineItemsGrid, /moneycard__currency">\$<\/span>/);
  assert.doesNotMatch(moneyInput, /moneycard__currency">\$<\/span>/);
});

test('la búsqueda de ciudades usa el idioma activo y separa catálogo, provider cache y browser cache', async () => {
  const hook = await read('src/modules/geocoding/useCitySearch.js');
  const client = await read('src/modules/geocoding/citySearchClient.js');
  const cache = await read('src/modules/geocoding/citySearchCache.js');
  const backend = await read('functions/geoapifyCityFunctions.js');
  const cityUtils = await read('functions/geoapifyCityUtils.js');

  assert.match(hook, /const \{ t, locale \} = useTranslation\(\)/);
  assert.match(hook, /language: locale/);
  assert.match(hook, /\[query, locale\]/);
  assert.match(hook, /abortRef\.current\.abort\(\)/);

  assert.match(client, /language = config\.defaultLocale/);
  assert.match(client, /const safeLanguage = normalizeLanguage\(language\)/);
  assert.match(client, /const cacheKey = `\$\{queryKey\}\|\$\{safeLanguage\}\|\$\{safeLimit\}`/);
  assert.match(client, /language: safeLanguage/);
  assert.match(client, /CANONICAL_CACHE_SOURCES/);
  assert.match(client, /CANONICAL_CACHE_SOURCES\.has\(responseSource\)/);
  assert.match(cache, /atlas:geoapify-city-cache:v8/);

  assert.match(backend, /const MAX_RESULTS = 5/);
  assert.doesNotMatch(backend, /MAX_PROVIDER_RESULTS|providerLimit/);
  assert.match(backend, /const language = requestedLanguage\(request\.data\?\.language\)/);
  assert.match(backend, /readCityCatalogQuery/);
  assert.match(backend, /const key = `city:v8:\$\{queryKey\}:lang=\$\{language\}:limit=\$\{MAX_RESULTS\}`/);
  assert.match(cityUtils, /limit: String\(safeLimit\)/);
  assert.match(cityUtils, /lang: safeLanguage/);
  assert.match(cityUtils, /bias: 'countrycode:none'/);
  assert.match(cityUtils, /address_line1/);
  assert.match(cityUtils, /formatted/);
});