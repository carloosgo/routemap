// test-contract: architecture
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');

test('la app se puede instalar en iPhone con manifest, icono y meta de Apple', () => {
  const html = read('index.html');
  assert.match(html, /rel="manifest" href="\/manifest\.webmanifest"/);
  assert.match(html, /rel="apple-touch-icon" href="\/pwa\/apple-touch-icon\.png"/);
  assert.match(html, /name="apple-mobile-web-app-capable" content="yes"/);
  assert.match(html, /viewport-fit=cover/);

  const manifest = JSON.parse(read('public/manifest.webmanifest'));
  assert.equal(manifest.display, 'standalone');
  assert.equal(manifest.start_url, '/');
  for (const icon of manifest.icons) {
    assert.ok(existsSync(new URL(`../public${icon.src}`, import.meta.url)), `falta ${icon.src}`);
  }
  assert.ok(existsSync(new URL('../public/pwa/apple-touch-icon.png', import.meta.url)));
});

test('el shell móvil respeta zonas seguras y lleva la navegación a la barra inferior', () => {
  const css = read('src/app/MobileAppShell.css');
  assert.match(css, /env\(safe-area-inset-top/);
  assert.match(css, /env\(safe-area-inset-bottom/);
  assert.match(css, /100dvh/);
  assert.match(read('src/main.jsx'), /import '\.\/app\/MobileAppShell\.css';/);

  const workspace = read('src/app/AppWorkspace.jsx');
  for (const id of ['segments', 'places', 'notes']) {
    assert.match(workspace, new RegExp(`id: '${id}'`));
  }
  assert.doesNotMatch(workspace, /id: 'map'/, 'no hay pestaña Mapa aparte');
  assert.match(workspace, /className="mobile-sheet__handle"/);
});

test('la hoja móvil tiene tres alturas y se ajusta al arrastrar o tocar el asa', async () => {
  const { sheetSnapHeights, nextSheetSnap } = await import('../src/app/mobileSheetModel.js');
  const heights = sheetSnapHeights(732);
  assert.deepEqual(heights, { low: 112, mid: 366, high: 612 });
  assert.equal(nextSheetSnap('mid', 366, 366, heights), 'high', 'tocar el asa sube');
  assert.equal(nextSheetSnap('high', 612, 612, heights), 'mid', 'tocar arriba baja a media');
  assert.equal(nextSheetSnap('mid', 366, 600, heights), 'high');
  assert.equal(nextSheetSnap('mid', 366, 130, heights), 'low');
  assert.equal(nextSheetSnap('mid', 366, 410, heights), 'high', 'un arrastre corto avanza una altura');
  assert.equal(nextSheetSnap('high', 612, 120, heights), 'low');
  assert.deepEqual(sheetSnapHeights(0), { low: 112, mid: 112, high: 112 });
});

test('el acceso con Google es obligatorio y la cuenta vive en una cápsula sobre el mapa', () => {
  const main = read('src/main.jsx');
  assert.match(main, /<AuthGate \/>/);
  assert.match(main, /import '\.\/app\/MapCapsules\.css';/);

  const gate = read('src/app/AuthGate.jsx');
  assert.match(gate, /continueWithGoogle/);
  assert.match(gate, /if \(!auth\.user\) return <SignInScreen/);
  assert.match(gate, /return <App auth=\{auth\} \/>;/);

  const capsule = read('src/app/AccountCapsule.jsx');
  assert.match(capsule, /signOut/);
  assert.match(read('src/App.jsx'), /<AccountCapsule/);

  const menu = read('src/app/AppWorkspaceMenu.jsx');
  assert.doesNotMatch(menu, /continueWithGoogle|importLocalTrips|signOut/);
  assert.doesNotMatch(read('src/app/useAccountMenu.js'), /importLocalTrips/);

  const css = read('src/app/MapCapsules.css');
  assert.match(css, /\.account-capsule \{[\s\S]*?top: calc\(var\(--trip-header-height, 63px\) \+ 14px\);/);
  assert.match(css, /\.topbar__save \{[\s\S]*?top: calc\(var\(--trip-header-height, 63px\) \+ 64px\) !important;/);
  assert.match(css, /workspace-anchor \{[\s\S]*?top: calc\(var\(--trip-header-height, 63px\) \+ 114px\) !important;/);
  assert.match(css, /\.itinerary-pdf-export__button \{[\s\S]*?top: calc\(var\(--trip-header-height, 63px\) \+ 164px\);/);
  assert.doesNotMatch(css, /#0e4f63/i, 'el avatar no usa un color fijo ajeno a la paleta de acento');
});
