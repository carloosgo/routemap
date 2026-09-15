// test-contract: behavior
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const source = readFileSync(resolve('src/modules/export/itineraryPdfHybrid.js'), 'utf8');

test('cards de notas mantienen número grande y un único eje visual para bandera ciudad y fecha', () => {
  assert.match(source, /page\.circle\(markerX, headerCenterY, 7\.5/);
  assert.match(source, /size: Number\(item\.number\) >= 10 \? 6\.6 : 7\.4/);
  assert.match(source, /drawCountryFlag\(page, item\.countryCode, box\.x \+ 25, headerCenterY - 5\.2, 15\.5, 10\.4\)/);
  assert.match(source, /const titleY = headerCenterY - \(layout\.titleSize \* 0\.40\)/);
  assert.match(source, /const inlineDateY = headerCenterY - \(layout\.dateSize \* 0\.40\)/);
});
