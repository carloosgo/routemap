import { getToken } from 'firebase/app-check';
import { config } from '../../config.js';
import { getFirebaseAppCheck } from '../../infrastructure/firebase/firebaseClient.js';

let googleMapsPromise = null;

async function configureGoogleMapsAppCheck(maps) {
  const appCheck = getFirebaseAppCheck();
  if (!appCheck) return maps;

  const { Settings } = await maps.importLibrary('core');
  Settings.getInstance().fetchAppCheckToken = () => getToken(appCheck, false);
  return maps;
}

export function loadGoogleMaps() {
  if (globalThis.google?.maps?.importLibrary) {
    return configureGoogleMapsAppCheck(globalThis.google.maps);
  }
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
    globalThis[callbackName] = async () => {
      delete globalThis[callbackName];
      try {
        resolve(await configureGoogleMapsAppCheck(globalThis.google.maps));
      } catch (error) {
        googleMapsPromise = null;
        reject(error);
      }
    };
    document.head.appendChild(script);
  });

  return googleMapsPromise;
}
