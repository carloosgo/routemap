import savedPlacePinTemplate from '../../assets/map/saved-place-pin.svg?raw';
import {
  DEFAULT_SAVED_PLACE_ICON_ID,
  savedPlaceMarkerStyles,
} from './savedPlaceMarkerPalette.js';
import './SavedPlaceSymbol.css';

const PLACE_SOURCE_ID = 'atlas-saved-places';
const PLACE_HIT_LAYER_ID = 'atlas-saved-places-layer';
const PLACE_SYMBOL_LAYER_ID = 'atlas-saved-places-symbol';

function savedPlacePinUrl(color) {
  const svg = savedPlacePinTemplate.replace('#19a5d0', color);
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
}

function loadImageElement(url) {
  return new Promise((resolve, reject) => {
    const image = document.createElement('img');
    image.width = 52;
    image.height = 56;
    image.decoding = 'async';
    image.addEventListener('load', () => resolve(image), { once: true });
    image.addEventListener(
      'error',
      () => reject(new Error(`No se pudo cargar el icono de lugar guardado: ${url}`)),
      { once: true }
    );
    image.src = url;
  });
}

function savedPlaceSymbolLayer() {
  return {
    id: PLACE_SYMBOL_LAYER_ID,
    type: 'symbol',
    source: PLACE_SOURCE_ID,
    layout: {
      'icon-image': ['coalesce', ['get', 'iconId'], DEFAULT_SAVED_PLACE_ICON_ID],
      'icon-size': [
        'interpolate',
        ['linear'],
        ['zoom'],
        5,
        0.9,
        10,
        1.08,
        15,
        1.24,
      ],
      'icon-anchor': 'bottom',
      'icon-allow-overlap': true,
      'icon-ignore-placement': true,
      'icon-rotation-alignment': 'viewport',
      'icon-pitch-alignment': 'viewport',
    },
  };
}

function keepHitAreaInvisible(map) {
  if (!map.getLayer(PLACE_HIT_LAYER_ID)) return;
  map.setPaintProperty(PLACE_HIT_LAYER_ID, 'circle-radius', 15);
  map.setPaintProperty(PLACE_HIT_LAYER_ID, 'circle-opacity', 0.001);
  map.setPaintProperty(PLACE_HIT_LAYER_ID, 'circle-stroke-opacity', 0);
}

export function installSavedPlaceSymbolLayer(map) {
  if (!map || map.getLayer(PLACE_SYMBOL_LAYER_ID)) return;

  Promise.all(
    savedPlaceMarkerStyles().map(async ({ color, iconId }) => ({
      iconId,
      image: await loadImageElement(savedPlacePinUrl(color)),
    }))
  )
    .then((icons) => {
      if (!map.getSource(PLACE_SOURCE_ID)) return;
      icons.forEach(({ iconId, image }) => {
        if (!map.hasImage(iconId)) {
          map.addImage(iconId, image, { pixelRatio: 2 });
        }
      });
      if (!map.getLayer(PLACE_SYMBOL_LAYER_ID)) {
        map.addLayer(savedPlaceSymbolLayer());
      }
      keepHitAreaInvisible(map);
    })
    .catch((error) => {
      console.warn('[Saved place marker] custom icon unavailable; using circle fallback', error);
    });
}
