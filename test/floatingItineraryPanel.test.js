// test-contract: architecture
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const root = new URL('../', import.meta.url);
const read = (path) => readFile(new URL(path, root), 'utf8');

test('desktop primary panels keep one integrated left column with depth only toward the map', async () => {
  const css = await read('src/app/FloatingItineraryPanel.css');
  const headerCss = await read('src/app/TripSummaryHeader.css');
  const headerLayout = await read('src/app/TripWorkspaceHeaderLayout.css');
  const compact = await read('src/modules/trips/ItineraryCompactTen.css');
  const main = await read('src/main.jsx');

  assert.match(css, /@media \(min-width:\s*721px\)/);
  assert.match(css, /\.workspace__desktop--column\s*\{[^}]*display:\s*grid;[^}]*grid-template-columns:\s*var\(--workspace-panel-width\) minmax\(0, 1fr\);/s);
  assert.match(headerLayout, /grid-template-columns:[\s\S]*var\(--atlas-nav-width\)[\s\S]*calc\(var\(--workspace-panel-width\) - var\(--atlas-nav-width\)\)[\s\S]*minmax\(0, 1fr\);/s);
  assert.match(headerLayout, /\.trip-summary__metrics::before\s*\{/);

  assert.match(css, /\.workspace__desktop--column > \.mappane\s*\{[^}]*position:\s*relative;[^}]*inset:\s*auto;/s);
  assert.match(css, /\.workspace-panel\s*\{[^}]*position:\s*relative;[^}]*z-index:\s*700;[^}]*width:\s*100%;[^}]*height:\s*100%;[^}]*display:\s*block;[^}]*border-radius:\s*0;[^}]*box-shadow:\s*8px 0 18px -14px rgba\(15, 23, 42, 0\.34\);/s);
  assert.match(
    css,
    /\.workspace-panel__content\.floating-editor\s*\{[^}]*width:\s*100%\s*!important;[^}]*height:\s*100%\s*!important;[^}]*border:\s*0\s*!important;[^}]*border-radius:\s*0\s*!important;[^}]*box-shadow:\s*none\s*!important;/s
  );
  assert.match(headerCss, /\.trip-summary\s*\{[^}]*border:\s*0;[^}]*box-shadow:\s*none;/s);
  assert.match(headerCss, /\.trip-summary::after\s*\{[^}]*right:\s*0;[^}]*bottom:\s*0;[^}]*left:\s*0;[^}]*height:\s*1px;[^}]*background:\s*#eef0f2;/s);
  assert.doesNotMatch(headerCss, /\.trip-summary\s*\{[^}]*border-bottom:/s);
  assert.match(css, /\.workspace-panel__toggle\s*\{[^}]*left:\s*var\(--workspace-panel-width\);[^}]*z-index:\s*701;/s);
  assert.match(css, /\.workspace__desktop--column\.is-panel-collapsed\s*\{[^}]*grid-template-columns:\s*0 minmax\(0, 1fr\);/s);
  assert.match(css, /\.workspace__desktop--column > \.mappane \.segnote,[\s\S]*left:\s*14px;/s);
  assert.match(css, /\.workspace__desktop--column > \.mappane \.segnote\s*\{[^}]*top:\s*calc\(var\(--trip-header-height\) \+ 12px\)\s*!important;/s);

  assert.match(compact, /min-height:\s*40px;[\s\S]*height:\s*40px;/s);
  assert.match(compact, /grid-template-columns:\s*18px 53px 126px minmax\(0, 1fr\);/);
  assert.match(compact, /grid-template-columns:\s*110px repeat\(3, 14px\);/);

  assert.match(main, /import '\.\/app\/FloatingItineraryPanel\.css';/);
  assert.ok(
    main.indexOf('FloatingItineraryPanel.css') > main.indexOf('NotePanelPlacement.css'),
    'la geometría integrada debe seguir cargándose después de la colocación de notas'
  );
});

test('integrated desktop geometry does not replace or rescale the mobile workspace', async () => {
  const css = await read('src/app/FloatingItineraryPanel.css');

  assert.doesNotMatch(css, /@media \(max-width:\s*720px\)/);
  assert.doesNotMatch(css, /workspace__mobile/);
  assert.doesNotMatch(css, /scale\(|zoom:/);
});
