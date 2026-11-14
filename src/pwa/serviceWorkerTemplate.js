/* global __ATLAS_PRECACHE__, self, caches, Request, Response */
/* Atlas · service worker (modo sin conexión).
 * Lo genera el build (vite.config.js) reemplazando __ATLAS_VERSION__ y
 * __ATLAS_PRECACHE__. Guarda la app en el teléfono para abrirla sin internet.
 * Solo toca peticiones del propio sitio y de fuentes/banderas: Firebase,
 * Google Maps y las Functions pasan directo a la red.
 */
const VERSION = '__ATLAS_VERSION__';
const SHELL_CACHE = `atlas-shell-${VERSION}`;
const RUNTIME_CACHE = 'atlas-runtime-v1';
const PRECACHE = __ATLAS_PRECACHE__;
const NAVIGATION_TIMEOUT_MS = 3500;
const RUNTIME_HOSTS = new Set(['fonts.googleapis.com', 'fonts.gstatic.com', 'flagcdn.com']);

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(SHELL_CACHE)
      .then((cache) => cache.addAll(PRECACHE.map((path) => new Request(path, { cache: 'reload' }))))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys
        .filter((key) => key.startsWith('atlas-shell-') && key !== SHELL_CACHE)
        .map((key) => caches.delete(key))))
      .then(() => self.clients.claim())
  );
});

function timeout(ms) {
  return new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), ms));
}

// Página: primero la red (versión nueva); sin red o lenta, la guardada.
async function navigation(request) {
  const cache = await caches.open(SHELL_CACHE);
  try {
    const response = await Promise.race([fetch(request), timeout(NAVIGATION_TIMEOUT_MS)]);
    if (response && response.ok) cache.put('/index.html', response.clone());
    return response;
  } catch {
    return (await cache.match('/index.html', { ignoreVary: true })) || Response.error();
  }
}

// Archivos con hash en el nombre: nunca cambian, primero la copia.
async function cacheFirst(request, cacheName) {
  const cache = await caches.open(cacheName);
  const cached = await cache.match(request, { ignoreVary: true });
  if (cached) return cached;
  const response = await fetch(request);
  if (response && (response.ok || response.type === 'opaque')) cache.put(request, response.clone());
  return response;
}

// Lo demás: la copia al instante y se actualiza por detrás.
async function staleWhileRevalidate(request, cacheName) {
  const cache = await caches.open(cacheName);
  const cached = await cache.match(request, { ignoreVary: true });
  const network = fetch(request)
    .then((response) => {
      if (response && (response.ok || response.type === 'opaque')) cache.put(request, response.clone());
      return response;
    })
    .catch(() => null);
  return cached || (await network) || Response.error();
}

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);

  if (url.origin === self.location.origin) {
    // /__/ es de Firebase (inicio de sesión); sw.js se revisa siempre en la red.
    if (url.pathname.startsWith('/__/') || url.pathname === '/sw.js') return;
    if (request.mode === 'navigate') {
      event.respondWith(navigation(request));
      return;
    }
    if (url.pathname.startsWith('/assets/')) {
      event.respondWith(cacheFirst(request, SHELL_CACHE));
      return;
    }
    event.respondWith(staleWhileRevalidate(request, SHELL_CACHE));
    return;
  }

  if (RUNTIME_HOSTS.has(url.hostname)) {
    event.respondWith(staleWhileRevalidate(request, RUNTIME_CACHE));
  }
});
