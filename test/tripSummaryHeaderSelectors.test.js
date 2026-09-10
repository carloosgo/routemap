// test-contract: architecture
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const root = new URL('../', import.meta.url);
const read = (path) => readFile(new URL(path, root), 'utf8');

test('moneda e idioma comparten el selector visual Atlas y no dependen del select nativo', async () => {
  const header = await read('src/app/TripSummaryHeader.jsx');
  const selector = await read('src/app/SummarySelectorMetric.jsx');

  assert.equal((header.match(/<SummarySelectorMetric/g) || []).length, 2);
  assert.doesNotMatch(header, /<select|<option/);
  assert.match(header, /const CURRENCIES = \['USD', 'EUR', 'MXN', 'GBP', 'JPY', 'CAD', 'BRL'\]/);
  assert.match(header, /menuClassName="trip-summary__selector-menu--currency"/);
  assert.match(header, /menuClassName="trip-summary__selector-menu--language"/);
  assert.match(header, /Intl\.DisplayNames/);

  assert.match(selector, /createPortal/);
  assert.match(selector, /role="listbox"/);
  assert.match(selector, /role="option"/);
  assert.match(selector, /aria-selected=\{active\}/);
  assert.match(selector, /IconCheck/);
  assert.match(selector, /closeOnOutsidePointer/);
  assert.match(selector, /closeOnEscape/);
});
