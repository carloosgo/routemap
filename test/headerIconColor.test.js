// test-contract: architecture
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const root = new URL('../', import.meta.url);
const read = (path) => readFile(new URL(path, root), 'utf8');

test('header icons stay neutral while active primary navigation uses save-button blue', async () => {
  const tokens = await read('src/app/headerVisualTokens.js');
  const navigation = await read('src/app/TripHeaderNavigation.jsx');
  const navCss = await read('src/app/TripHeaderNavigation.css');
  const header = await read('src/app/TripSummaryHeader.jsx');
  const selector = await read('src/app/SummarySelectorMetric.jsx');

  assert.match(tokens, /HEADER_ICON_COLOR\s*=\s*'#667085'/);
  assert.match(navigation, /trip-summary__primary-nav-icon[\s\S]*style=\{\{ color: HEADER_ICON_COLOR \}\}/s);
  assert.match(navCss, /\.trip-summary__primary-nav-item\.is-active \.trip-summary__primary-nav-icon\s*\{[\s\S]*color:\s*var\(--marina, #0e4f63\)\s*!important;/s);

  const metricUses = header.match(/iconColor=\{HEADER_ICON_COLOR\}/g) || [];
  assert.equal(metricUses.length, 6, 'Fechas, Total, Destinos, Noches, Moneda e Idioma deben conservar #667085');
  assert.match(header, /IconChevronDown[\s\S]*style=\{\{ color: HEADER_ICON_COLOR \}\}[\s\S]*className=\{showBreakdown \? 'is-open' : ''\}/s);
  assert.match(selector, /IconChevronDown[\s\S]*style=\{\{ color: iconColor \}\}/s);

  const brand = header.match(/<span className="trip-summary__brand-icon"[\s\S]*?<\/span>/s)?.[0] || '';
  assert.ok(brand, 'el icono de marca debe seguir presente');
  assert.doesNotMatch(brand, /HEADER_ICON_COLOR|#667085/);
});

test('header keeps only Notes-to-Dates and Nights-to-Currency vertical separators', async () => {
  const navigationCss = await read('src/app/TripHeaderNavigation.css');
  const header = await read('src/app/TripSummaryHeader.jsx');
  const summaryCss = await read('src/app/TripSummaryHeader.css');
  const selector = await read('src/app/SummarySelectorMetric.jsx');
  const layout = await read('src/app/TripWorkspaceHeaderLayout.css');

  assert.match(layout, /\.trip-summary__metrics::before\s*\{[\s\S]*width:\s*1px;/s);
  assert.doesNotMatch(navigationCss, /\.trip-summary__primary-nav-item \+ \.trip-summary__primary-nav-item::before/);
  assert.doesNotMatch(summaryCss, /\.trip-summary__metrics > \* \+ \*::before/);
  assert.match(summaryCss, /\.trip-summary__metric--currency::before\s*\{[\s\S]*width:\s*1px;[\s\S]*height:\s*22px;/s);

  const currency = header.match(/<SummarySelectorMetric\s+Icon=\{IconCurrencyDollar\}[\s\S]*?\/>/s)?.[0] || '';
  const language = header.match(/<SummarySelectorMetric\s+Icon=\{IconLanguage\}[\s\S]*?\/>/s)?.[0] || '';
  assert.ok(currency && language, 'Moneda e Idioma deben seguir presentes');
  assert.match(currency, /className="trip-summary__metric--currency"/);
  assert.doesNotMatch(language, /trip-summary__metric--currency/);
  assert.match(selector, /className = ''/);
  assert.match(selector, /trip-summary__metric--selector\$\{className \? ` \$\{className\}` : ''\}/);
});
