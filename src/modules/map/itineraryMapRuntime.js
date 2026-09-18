let currentGoogleMap = null;
let currentMapElement = null;

function finite(value) {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : null;
}

function normalizeMapType(value) {
  const mapType = String(value || 'roadmap').toLowerCase();
  return ['roadmap', 'satellite', 'hybrid', 'terrain'].includes(mapType)
    ? mapType
    : 'roadmap';
}

export function registerItineraryGoogleMap(map, element = null) {
  currentGoogleMap = map || null;
  currentMapElement = element || map?.getDiv?.() || null;
}

export function getItineraryMapRuntimeView() {
  const map = currentGoogleMap;
  if (!map) return null;
  const center = map.getCenter?.();
  const lat = finite(center?.lat?.());
  const lon = finite(center?.lng?.());
  const zoom = finite(map.getZoom?.());
  const element = currentMapElement || map.getDiv?.();
  const rect = element?.getBoundingClientRect?.();
  const width = finite(rect?.width ?? element?.clientWidth);
  const height = finite(rect?.height ?? element?.clientHeight);
  if (lat == null || lon == null || zoom == null || width == null || height == null) return null;
  if (width < 2 || height < 2) return null;

  return Object.freeze({
    center: Object.freeze({ lat, lon }),
    zoom,
    mapType: normalizeMapType(map.getMapTypeId?.()),
    width,
    height,
  });
}

export function clearItineraryMapRuntimeView(map = null) {
  if (map && currentGoogleMap && map !== currentGoogleMap) return;
  currentGoogleMap = null;
  currentMapElement = null;
}
