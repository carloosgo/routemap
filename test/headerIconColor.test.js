// test-contract: architecture
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const root = new URL('../', import.meta.url);
const read = (path) => readFile(new URL(path, root), 'utf8');

test('header icons stay neutral while active primary navigation uses save-button blue', async () => {
  const tokens = await read('src/app/headerVisualTokens.js');
  const navigation = await read('src/app/TripHeaderNavigation.jsx');
  const header = await read('src/app/TripSummaryHeader.jsx');
  const selector = await read('src/app/SummarySelectorMetric.jsx');

  assert.match(tokens, /HEADER_ICON_COLOR\s*=\s*'#667085'/);
  assert.match(tokens, /HEADER_ACTIVE_ICON_COLOR\s*=\s*'var\(--marina, #0e4f63\)'/);
  assert.match(
    navigation,
    /style=\{\{ color: isActive \? HEADER_ACTIVE_ICON_COLOR : HEADER_ICON_COLOR \}\}/
  );

  const metricUses = header.match(/iconColor=\{HEADER_ICON_COLOR\}/g) || [];
  assert.equal(metricUses.length, 6, 'Fechas, Total, Destinos, Noches, Moneda e Idioma deben conservar #667085');
  assert.match(header, /IconChevronDown[\s\S]*style=\{\{ color: HEADER_ICON_COLOR \}\}[\s\S]*className=\{showBreakdown \? 'is-open' : ''\}/s);
  assert.match(selector, /IconChevronDown[\s\S]*style=\{\{ color: iconColor \}\}/s);

  const brand = header.match(/<span className="trip-summary__brand-icon"[\s\S]*?<\/span>/s)?.[0] || '';
  assert.ok(brand, 'el icono de marca debe seguir presente');
  assert.doesNotMatch(brand, /HEADER_ICON_COLOR|HEADER_ACTIVE_ICON_COLOR|#667085/);
});

test('header keeps only Notes-to-Dates and Nights-to-Currency vertical separators', async () => {
  const navigation = await read('src/app/TripHeaderNavigation.jsx');
  const header = await read('src/app/TripSummaryHeader.jsx');
  const selector = await read('src/app/SummarySelectorMetric.jsx');
  const layout = await read('src/app/TripWorkspaceHeaderLayout.css');

  assert.match(layout, /\.trip-summary__metrics::before\s*\{[\s\S]*width:\s*1px;/s);
  assert.match(navigation, /function NavDividerMask\(\{ index \}\)/);
  assert.match(navigation, /left:\s*index === 1 \? '-5px' : '-8px'/);

  const hiddenMetrics = header.match(/hideLeadingDivider/g) || [];
  assert.equal(hiddenMetrics.length, 5, 'prop declaration plus Total, Destinos, Noches e Idioma deben suprimir su separador');

  const currency = header.match(/<SummarySelectorMetric\s+Icon=\{IconCurrencyDollar\}[\s\S]*?\/>/s)?.[0] || '';
  const language = header.match(/<SummarySelectorMetric\s+Icon=\{IconLanguage\}[\s\S]*?\/>/s)?.[0] || '';
  assert.ok(currency && language, 'Moneda e Idioma deben seguir presentes');
  assert.doesNotMatch(currency, /hideLeadingDivider/);
  assert.match(language, /hideLeadingDivider/);
  assert.match(selector, /<LeadingDividerMask hidden=\{hideLeadingDivider\} \/>/);
});
