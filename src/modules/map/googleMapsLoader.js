import { config } from '../../config.js';

let googleMapsPromise = null;

export function loadGoogleMaps() {
  if (globalThis.google?.maps?.importLibrary) return Promise.resolve(globalThis.google.maps);
  if (googleMapsPromise) return googleMapsPromise;
  if (!config.googleMaps.webApiKey) {
    return Promise.reject(new Error('Falta VITE_GOOGLE_MAPS_API_KEY.'));
  }

  googleMapsPromise = new Promise((resolve, reject) => {
    const callbackName = `__atlasGoogleMapsReady_${Date.now()}`;
    const script = document.createElement('script');
    const params = new URLSearchParams({
      key: config.googleMaps.webApiKey,
      v: 'weekly',
      loading: 'async',
      callback: callbackName,
    });
    script.src = `https://maps.googleapis.com/maps/api/js?${params}`;
    script.async = true;
    script.defer = true;
    script.onerror = () => {
      delete globalThis[callbackName];
      googleMapsPromise = null;
      reject(new Error('No fue posible cargar Google Maps.'));
    };
    globalThis[callbackName] = () => {
      delete globalThis[callbackName];
      resolve(globalThis.google.maps);
    };
    document.head.appendChild(script);
  });

  return googleMapsPromise;
}
