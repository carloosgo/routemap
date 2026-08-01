import mapboxgl from 'mapbox-gl';

const LANDMARK_LAYER_ID = 'atlas-city-landmarks';
const originalAddLayer = mapboxgl.Map.prototype.addLayer;

if (!mapboxgl.Map.prototype.__atlasLandmarkLayerPatched) {
  mapboxgl.Map.prototype.addLayer = function addLayerWithAtlasLandmarkPriority(layer, beforeId) {
    if (layer?.id === LANDMARK_LAYER_ID) {
      layer.layout = {
        ...layer.layout,
        'icon-allow-overlap': true,
        'icon-ignore-placement': true,
      };
      delete layer.layout['icon-optional'];
    }

    return originalAddLayer.call(this, layer, beforeId);
  };

  Object.defineProperty(mapboxgl.Map.prototype, '__atlasLandmarkLayerPatched', {
    value: true,
    configurable: false,
    enumerable: false,
    writable: false,
  });
}
