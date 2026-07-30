import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const manifestPath = new URL('../public/manifest.webmanifest', import.meta.url);
const serviceWorkerPath = new URL('../public/sw.js', import.meta.url);
const indexPath = new URL('../index.html', import.meta.url);

async function read(path) {
  return readFile(path, 'utf8');
}

test('manifest PWA contiene los campos instalables esenciales', async () => {
  const manifest = JSON.parse(await read(manifestPath));

  assert.equal(manifest.name, 'Atlas · Rutas de viaje');
  assert.equal(manifest.display, 'standalone');
  assert.equal(manifest.start_url, '/');
  assert.equal(manifest.scope, '/');
  assert.ok(Array.isArray(manifest.icons));
  assert.ok(manifest.icons.some((icon) => icon.src === '/atlas-icon.svg'));
});

test('HTML enlaza manifest e icono sin alterar el root de React', async () => {
  const html = await read(indexPath);

  assert.match(html, /rel="manifest" href="\/manifest\.webmanifest"/);
  assert.match(html, /rel="icon" href="\/atlas-icon\.svg"/);
  assert.match(html, /<div id="root"><\/div>/);
});

test('service worker solo cachea GET del mismo origen y excluye API', async () => {
  const source = await read(serviceWorkerPath);

  assert.match(source, /request\.method !== 'GET'/);
  assert.match(source, /url\.origin !== self\.location\.origin/);
  assert.match(source, /url\.pathname\.startsWith\('\/api\/'\)/);
  assert.doesNotMatch(source, /mapbox\.com|nominatim\.openstreetmap\.org/);
});
