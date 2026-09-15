let currentItineraryMapView = null;

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

export function setItineraryMapRuntimeView(view) {
  const lat = finite(view?.center?.lat);
  const lon = finite(view?.center?.lon ?? view?.center?.lng);
  const zoom = finite(view?.zoom);
  const width = finite(view?.width);
  const height = finite(view?.height);
  if (lat == null || lon == null || zoom == null || width == null || height == null) return;
  if (width < 2 || height < 2) return;

  currentItineraryMapView = Object.freeze({
    center: Object.freeze({ lat, lon }),
    zoom,
    mapType: normalizeMapType(view?.mapType),
    width,
    height,
  });
}

export function getItineraryMapRuntimeView() {
  return currentItineraryMapView;
}

export function clearItineraryMapRuntimeView() {
  currentItineraryMapView = null;
}
