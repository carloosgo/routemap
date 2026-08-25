const DEFAULT_DASH_PX = 4;
const DEFAULT_GAP_PX = 6;
const DEFAULT_STROKE_WEIGHT = 2;
const DEFAULT_STROKE_COLOR = '#111111';
const DEFAULT_REPEAT_PX = DEFAULT_DASH_PX + DEFAULT_GAP_PX;

function coordinateValue(point, key) {
  const value = point?.[key];
  return Number(typeof value === 'function' ? value.call(point) : value);
}

function normalizedPath(path) {
  return (path || [])
    .map((point) => ({
      lat: coordinateValue(point, 'lat'),
      lng: coordinateValue(point, 'lng'),
    }))
    .filter((point) => Number.isFinite(point.lat) && Number.isFinite(point.lng));
}

function dashedPolylineOptions(map, path) {
  return {
    map,
    path,
    clickable: false,
    draggable: false,
    editable: false,
    geodesic: false,
    strokeOpacity: 0,
    strokeWeight: 0,
    zIndex: 100,
    icons: [{
      icon: {
        path: `M 0,-${DEFAULT_DASH_PX / 2} 0,${DEFAULT_DASH_PX / 2}`,
        strokeColor: DEFAULT_STROKE_COLOR,
        strokeOpacity: 1,
        strokeWeight: DEFAULT_STROKE_WEIGHT,
        scale: 1,
      },
      offset: '0',
      repeat: `${DEFAULT_REPEAT_PX}px`,
    }],
  };
}

export function createCrispDashedRoutes({
  maps,
  map,
  routes = [],
}) {
  if (!maps?.Polyline || !map) {
    return {
      setRoutes() {},
      refresh() {},
      dispose() {},
    };
  }

  let disposed = false;
  let routePolylines = [];

  const createRoutePolyline = (path) => new maps.Polyline(
    dashedPolylineOptions(map, path)
  );

  const reconcile = (nextRoutes) => {
    if (disposed) return;
    const safeRoutes = Array.isArray(nextRoutes) ? nextRoutes : [];

    safeRoutes.forEach((route, index) => {
      const path = normalizedPath(route?.path);
      const existing = routePolylines[index];
      if (existing) {
        existing.setPath(path);
      } else {
        routePolylines[index] = createRoutePolyline(path);
      }
    });

    while (routePolylines.length > safeRoutes.length) {
      routePolylines.pop()?.setMap(null);
    }
  };

  reconcile(routes);

  return {
    setRoutes(nextRoutes) {
      reconcile(nextRoutes);
    },
    refresh() {
      /* Native Google Maps polylines stay synchronized with pan/zoom inside the
         provider rendering pipeline. Deliberately no JS camera-frame redraw. */
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      routePolylines.forEach((polyline) => polyline.setMap(null));
      routePolylines = [];
    },
  };
}
