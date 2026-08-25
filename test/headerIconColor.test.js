// test-contract: architecture
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const root = new URL('../', import.meta.url);
const read = (path) => readFile(new URL(path, root), 'utf8');

test('header icons stay gray except the selected primary navigation icon, which uses the save-button blue', async () => {
  const tokens = await read('src/app/headerVisualTokens.js');
  const navigation = await read('src/app/TripHeaderNavigation.jsx');
  const header = await read('src/app/TripSummaryHeader.jsx');
  const selector = await read('src/app/SummarySelectorMetric.jsx');

  assert.match(tokens, /HEADER_ICON_COLOR\s*=\s*'#667085'/);
  assert.match(tokens, /HEADER_ACTIVE_NAV_ICON_COLOR\s*=\s*'var\(--marina, #0e4f63\)'/);
  assert.match(
    navigation,
    /trip-summary__primary-nav-icon[\s\S]*?color:\s*isActive\s*\?\s*HEADER_ACTIVE_NAV_ICON_COLOR\s*:\s*HEADER_ICON_COLOR/s
  );
  assert.match(navigation, /<span className="trip-summary__primary-nav-label">\{t\(labelKey\)\}<\/span>/);

  const metricUses = header.match(/iconColor=\{HEADER_ICON_COLOR\}/g) || [];
  assert.equal(metricUses.length, 6, 'Fechas, Total, Destinos, Noches, Moneda e Idioma deben conservar #667085');
  assert.match(header, /IconChevronDown[\s\S]*style=\{\{ color: HEADER_ICON_COLOR \}\}[\s\S]*className=\{showBreakdown \? 'is-open' : ''\}/s);
  assert.match(selector, /IconChevronDown[\s\S]*style=\{\{ color: iconColor \}\}/s);

  const brand = header.match(/<span className="trip-summary__brand-icon"[\s\S]*?<\/span>/s)?.[0] || '';
  assert.ok(brand, 'el icono de marca debe seguir presente');
  assert.doesNotMatch(brand, /HEADER_ICON_COLOR|HEADER_ACTIVE_NAV_ICON_COLOR|#667085|#0e4f63/);
});
