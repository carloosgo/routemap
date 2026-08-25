// test-contract: architecture
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const root = new URL('../', import.meta.url);
const read = (path) => readFile(new URL(path, root), 'utf8');

test('header icons share #667085 while active primary navigation uses the Atlas system blue', async () => {
  const tokens = await read('src/app/headerVisualTokens.js');
  const navigation = await read('src/app/TripHeaderNavigation.jsx');
  const header = await read('src/app/TripSummaryHeader.jsx');
  const selector = await read('src/app/SummarySelectorMetric.jsx');

  assert.match(tokens, /HEADER_ICON_COLOR\s*=\s*'#667085'/);
  assert.match(navigation, /const activeColor = 'var\(--atlas-accent\)'/);
  assert.match(navigation, /trip-summary__primary-nav-icon[\s\S]*style=\{\{ color: isActive \? activeColor : HEADER_ICON_COLOR \}\}/s);
  assert.match(navigation, /trip-summary__primary-nav-label[\s\S]*style=\{\{ color: isActive \? activeColor : undefined \}\}/s);

  const metricUses = header.match(/iconColor=\{HEADER_ICON_COLOR\}/g) || [];
  assert.equal(metricUses.length, 6, 'Fechas, Total, Destinos, Noches, Moneda e Idioma deben compartir el mismo color');
  assert.match(header, /IconChevronDown[\s\S]*style=\{\{ color: HEADER_ICON_COLOR \}\}[\s\S]*className=\{showBreakdown \? 'is-open' : ''\}/s);
  assert.match(selector, /IconChevronDown[\s\S]*style=\{\{ color: iconColor \}\}/s);

  const brand = header.match(/<span className="trip-summary__brand-icon"[\s\S]*?<\/span>/s)?.[0] || '';
  assert.ok(brand, 'el icono de marca debe seguir presente');
  assert.doesNotMatch(brand, /HEADER_ICON_COLOR|#667085|atlas-accent/);
});
