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
  for (const id of ['segments', 'places', 'notes', 'map']) {
    assert.match(workspace, new RegExp(`id: '${id}'`));
  }
});

test('el menú ⋮ ofrece iniciar sesión con Google para sincronizar dispositivos', () => {
  const menu = read('src/app/AppWorkspaceMenu.jsx');
  assert.match(menu, /continueWithGoogle/);
  assert.match(menu, /importLocalTrips/);
  assert.match(menu, /signOut/);
});
