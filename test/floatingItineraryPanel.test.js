// test-contract: architecture
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const root = new URL('../', import.meta.url);
const read = (path) => readFile(new URL(path, root), 'utf8');

test('desktop itinerary panel floats over a full-width map with rounded corners', async () => {
  const css = await read('src/app/FloatingItineraryPanel.css');
  const main = await read('src/main.jsx');

  assert.match(css, /@media \(min-width:\s*721px\)/);
  assert.match(css, /\.workspace__desktop--column\s*\{[^}]*display:\s*block;/s);
  assert.match(css, /\.workspace__desktop--column > \.mappane\s*\{[^}]*position:\s*absolute;[^}]*inset:\s*0;/s);
  assert.match(
    css,
    /\.workspace-panel\s*\{[^}]*top:\s*calc\(var\(--trip-header-height\) \+ 14px\);[^}]*bottom:\s*14px;[^}]*left:\s*14px;/s
  );
  assert.match(
    css,
    /\.workspace-panel__content\.floating-editor\s*\{[^}]*border-radius:\s*12px\s*!important;[^}]*box-shadow:\s*0 10px 30px rgba\(15, 23, 42, 0\.16\)\s*!important;/s
  );
  assert.match(
    css,
    /\.workspace__desktop--column > \.mappane \.segnote,[\s\S]*left:\s*calc\(28px \+ var\(--workspace-panel-width/s
  );
  assert.match(main, /import '\.\/app\/FloatingItineraryPanel\.css';/);
  assert.ok(
    main.indexOf('FloatingItineraryPanel.css') > main.indexOf('NotePanelPlacement.css'),
    'la geometría flotante debe ser la última autoridad de layout del workspace'
  );
});

test('floating-panel geometry does not replace the mobile workspace', async () => {
  const css = await read('src/app/FloatingItineraryPanel.css');

  assert.doesNotMatch(css, /@media \(max-width:\s*720px\)/);
  assert.doesNotMatch(css, /workspace__mobile/);
});
