// test-contract: behavior
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const source = readFileSync(resolve('src/modules/export/itineraryPdfHybrid.js'), 'utf8');

test('cards de notas mantienen número grande y alinean ciudad y fecha con separador medio', () => {
  assert.match(source, /page\.circle\(markerX, headerCenterY, 7\.5/);
  assert.match(source, /size: Number\(item\.number\) >= 10 \? 6\.6 : 7\.4/);
  assert.match(source, /drawCountryFlag\(page, item\.countryCode, box\.x \+ 25, headerCenterY - 5\.2, 15\.5, 10\.4\)/);
  assert.match(source, /const titleY = headerCenterY - \(layout\.titleSize \* 0\.40\)/);
  assert.match(source, /const inlineDateY = titleY \+ \(\(layout\.titleSize - layout\.dateSize\) \* 0\.82\)/);
  assert.match(source, /const inlineDateText = dateText \? `· \$\{dateText\}` : ''/);
  assert.match(source, /page\.text\(layout\.inlineDateText, titleX \+ layout\.cityWidth \+ 6, inlineDateY/);
});

test('PDF usa el azul verdoso del sistema en cabeceras y fechas del listado', () => {
  assert.match(source, /const SYSTEM_TEAL = '#0e4f63'/);
  assert.match(source, /color: SYSTEM_TEAL, align: 'center'/);
  assert.match(source, /size: 6\.8, bold: true, color: SYSTEM_TEAL/);
});
