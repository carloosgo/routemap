import { getToken } from 'firebase/app-check';
import { config } from '../../config.js';
import { getFirebaseAppCheck } from '../../infrastructure/firebase/firebaseClient.js';
import { registerItineraryGoogleMap } from './itineraryMapRuntime.js';

let googleMapsPromise = null;
const instrumentedNamespaces = new WeakMap();
const instrumentedMapLibraries = new WeakMap();

function instrumentMapLibrary(library) {
  if (!library?.Map || typeof library.Map !== 'function') return library;
  if (instrumentedMapLibraries.has(library)) return instrumentedMapLibraries.get(library);

  const OriginalMap = library.Map;
  function AtlasInstrumentedMap(...args) {
    const map = new OriginalMap(...args);
    registerItineraryGoogleMap(map, args[0]);
    return map;
  }
  AtlasInstrumentedMap.prototype = OriginalMap.prototype;
  Object.setPrototypeOf(AtlasInstrumentedMap, OriginalMap);

  const instrumented = Object.create(library);
  Object.defineProperty(instrumented, 'Map', {
    value: AtlasInstrumentedMap,
    enumerable: true,
    configurable: false,
    writable: false,
  });
  instrumentedMapLibraries.set(library, instrumented);
  return instrumented;
}

function instrumentMapsNamespace(maps) {
  if (!maps?.importLibrary) return maps;
  if (instrumentedNamespaces.has(maps)) return instrumentedNamespaces.get(maps);

  const instrumented = Object.create(maps);
  Object.defineProperty(instrumented, 'importLibrary', {
    enumerable: true,
    configurable: false,
    writable: false,
    value: async (libraryName) => {
      const library = await maps.importLibrary(libraryName);
      return libraryName === 'maps' ? instrumentMapLibrary(library) : library;
    },
  });
  instrumentedNamespaces.set(maps, instrumented);
  return instrumented;
}

async function configureGoogleMapsAppCheck(maps) {
  const appCheck = getFirebaseAppCheck();
  if (appCheck) {
    const { Settings } = await maps.importLibrary('core');
    Settings.getInstance().fetchAppCheckToken = () => getToken(appCheck, false);
  }
  return instrumentMapsNamespace(maps);
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
