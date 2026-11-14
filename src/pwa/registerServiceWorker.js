/** Registra el service worker que permite abrir Atlas sin internet. */
export function registerServiceWorker({ enabled = import.meta.env?.PROD } = {}) {
  if (!enabled || typeof window === 'undefined' || !('serviceWorker' in navigator)) return;
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').catch(() => {
      // Sin service worker la app funciona igual, solo que no abre sin red.
    });
  });
}
