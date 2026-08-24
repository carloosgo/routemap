const DEFAULT_DASH_PX = 4;
const DEFAULT_GAP_PX = 6;
const DEFAULT_STROKE_WEIGHT = 2;
const SVG_NS = 'http://www.w3.org/2000/svg';

function finitePoint(point) {
  return Boolean(point && Number.isFinite(point.x) && Number.isFinite(point.y));
}

function normalizedLatLngPath(path, maps) {
  return (path || []).map((point) => (
    point instanceof maps.LatLng ? point : new maps.LatLng(point)
  ));
}

function projectedPoints(path, projection) {
  const points = [];
  for (const point of path) {
    const projected = projection.fromLatLngToDivPixel(point);
    if (finitePoint(projected)) points.push(projected);
  }
  return points;
}

function toSvgPath(points) {
  if (points.length < 2) return '';

  let value = `M ${points[0].x.toFixed(2)} ${points[0].y.toFixed(2)}`;
  for (let index = 1; index < points.length; index += 1) {
    value += ` L ${points[index].x.toFixed(2)} ${points[index].y.toFixed(2)}`;
  }
  return value;
}

function createRoutePath() {
  const path = document.createElementNS(SVG_NS, 'path');
  path.setAttribute('fill', 'none');
  path.setAttribute('stroke', '#111111');
  path.setAttribute('stroke-opacity', '1');
  path.setAttribute('stroke-width', String(DEFAULT_STROKE_WEIGHT));
  path.setAttribute('stroke-dasharray', `${DEFAULT_DASH_PX} ${DEFAULT_GAP_PX}`);
  path.setAttribute('stroke-linecap', 'butt');
  path.setAttribute('stroke-linejoin', 'round');
  path.setAttribute('vector-effect', 'non-scaling-stroke');
  path.setAttribute('shape-rendering', 'geometricPrecision');
  return path;
}

export function createCrispDashedRoutes({
  maps,
  map,
  routes = [],
}) {
  if (!maps?.OverlayView || !map) {
    return {
      setRoutes() {},
      refresh() {},
      dispose() {},
    };
  }

  const prepareRoutes = (nextRoutes) => (nextRoutes || []).map((route) => ({
    ...route,
    path: normalizedLatLngPath(route.path, maps),
  }));

  const overlay = new maps.OverlayView();
  let preparedRoutes = prepareRoutes(routes);
  let svg = null;
  let routePaths = [];
  let drawFrame = 0;
  let disposed = false;

  const removeRoutePath = ({ element }) => {
    element.remove();
  };

  const clearRoutePaths = () => {
    routePaths.forEach(removeRoutePath);
    routePaths = [];
  };

  const render = () => {
    drawFrame = 0;
    if (disposed || !svg) return;
    const projection = overlay.getProjection?.();
    if (!projection) return;

    routePaths.forEach((routePath) => {
      const { element, path } = routePath;
      const points = projectedPoints(path, projection);
      const d = toSvgPath(points);
      if (d) {
        if (routePath.lastPathValue !== d) {
          element.setAttribute('d', d);
          routePath.lastPathValue = d;
        }
        element.style.display = '';
      } else {
        if (routePath.lastPathValue) {
          element.removeAttribute('d');
          routePath.lastPathValue = '';
        }
        element.style.display = 'none';
      }
    });
  };

  const scheduleRender = () => {
    if (disposed || drawFrame) return;
    drawFrame = requestAnimationFrame(render);
  };

  const createRoutePathState = (route) => {
    const element = createRoutePath();
    svg.append(element);
    return {
      element,
      path: route.path,
      lastPathValue: '',
    };
  };

  const reconcileRoutePaths = () => {
    if (!svg || disposed) return;

    preparedRoutes.forEach((route, index) => {
      const current = routePaths[index];
      if (current) {
        current.path = route.path;
      } else {
        routePaths[index] = createRoutePathState(route);
      }
    });

    while (routePaths.length > preparedRoutes.length) {
      removeRoutePath(routePaths.pop());
    }

    scheduleRender();
  };

  overlay.onAdd = () => {
    const pane = overlay.getPanes?.()?.overlayLayer;
    if (!pane || disposed) return;

    svg = document.createElementNS(SVG_NS, 'svg');
    svg.setAttribute('aria-hidden', 'true');
    svg.setAttribute('focusable', 'false');
    Object.assign(svg.style, {
      position: 'absolute',
      left: '0',
      top: '0',
      width: '1px',
      height: '1px',
      overflow: 'visible',
      pointerEvents: 'none',
    });

    pane.append(svg);
    reconcileRoutePaths();
  };

  overlay.draw = () => {
    scheduleRender();
  };

  overlay.onRemove = () => {
    if (drawFrame) cancelAnimationFrame(drawFrame);
    drawFrame = 0;
    clearRoutePaths();
    svg?.remove();
    svg = null;
  };

  overlay.setMap(map);

  return {
    setRoutes(nextRoutes) {
      if (disposed) return;
      preparedRoutes = prepareRoutes(nextRoutes);
      reconcileRoutePaths();
    },
    refresh() {
      scheduleRender();
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      if (drawFrame) cancelAnimationFrame(drawFrame);
      drawFrame = 0;
      overlay.setMap(null);
    },
  };
}
