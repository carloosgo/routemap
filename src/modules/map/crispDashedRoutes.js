const DEFAULT_DASH_PX = 4;
const DEFAULT_GAP_PX = 6;
const DEFAULT_STROKE_WEIGHT = 1;
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

function dashedIconSequence() {
  return [{
    icon: {
      path: `M 0,-${DEFAULT_DASH_PX / 2} 0,${DEFAULT_DASH_PX / 2}`,
      strokeColor: DEFAULT_STROKE_COLOR,
      strokeOpacity: 1,
      strokeWeight: DEFAULT_STROKE_WEIGHT,
      scale: 1,
    },
    offset: '0',
    repeat: `${DEFAULT_REPEAT_PX}px`,
  }];
}

function dashedStyleOptions() {
  return {
    strokeOpacity: 0,
    strokeWeight: DEFAULT_STROKE_WEIGHT,
    icons: dashedIconSequence(),
  };
}

function dashedPolylineOptions(map, path) {
  return {
    map,
    path,
    clickable: false,
    draggable: false,
    editable: false,
    geodesic: false,
    zIndex: 100,
    ...dashedStyleOptions(),
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
  let idleListener = null;

  const createRoutePolyline = (path) => new maps.Polyline(
    dashedPolylineOptions(map, path)
  );

  const refreshStyles = () => {
    if (disposed) return;
    routePolylines.forEach((polyline) => {
      polyline.setOptions?.(dashedStyleOptions());
    });
  };

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
  idleListener = map.addListener?.('idle', refreshStyles) || null;

  return {
    setRoutes(nextRoutes) {
      reconcile(nextRoutes);
    },
    refresh() {
      /* Pixel-defined dash styling is reapplied after camera/layout changes so
         vector-map zoom interpolation cannot leave the symbol visually scaled. */
      refreshStyles();
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      idleListener?.remove?.();
      idleListener = null;
      routePolylines.forEach((polyline) => polyline.setMap(null));
      routePolylines = [];
    },
  };
}
