const DEFAULT_DASH_PX = 4;
const DEFAULT_GAP_PX = 6;
const DEFAULT_STROKE_WEIGHT = 2;
const VIEWPORT_PADDING_PX = 192;
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
  return path.map((point) => {
    const projected = projection.fromLatLngToDivPixel(point);
    return finitePoint(projected) ? projected : null;
  });
}

function viewportRect(map) {
  const mapElement = map.getDiv?.();
  if (!mapElement) return null;

  const elementBounds = mapElement.getBoundingClientRect?.();
  const width = Number(mapElement.clientWidth) || Number(elementBounds?.width);
  const height = Number(mapElement.clientHeight) || Number(elementBounds?.height);
  if (!(width > 0) || !(height > 0)) return null;

  return {
    left: -VIEWPORT_PADDING_PX,
    top: -VIEWPORT_PADDING_PX,
    right: width + VIEWPORT_PADDING_PX,
    bottom: height + VIEWPORT_PADDING_PX,
  };
}

function clipSegmentToRect(start, end, rect) {
  if (!finitePoint(start) || !finitePoint(end) || !rect) return null;

  const dx = end.x - start.x;
  const dy = end.y - start.y;
  let minTime = 0;
  let maxTime = 1;
  const edges = [
    [-dx, start.x - rect.left],
    [dx, rect.right - start.x],
    [-dy, start.y - rect.top],
    [dy, rect.bottom - start.y],
  ];

  for (const [direction, distance] of edges) {
    if (direction === 0) {
      if (distance < 0) return null;
      continue;
    }

    const time = distance / direction;
    if (direction < 0) {
      if (time > maxTime) return null;
      if (time > minTime) minTime = time;
    } else {
      if (time < minTime) return null;
      if (time < maxTime) maxTime = time;
    }
  }

  return [
    { x: start.x + (minTime * dx), y: start.y + (minTime * dy) },
    { x: start.x + (maxTime * dx), y: start.y + (maxTime * dy) },
  ];
}

function samePoint(first, second) {
  return Boolean(
    first
    && second
    && Math.abs(first.x - second.x) < 0.01
    && Math.abs(first.y - second.y) < 0.01
  );
}

function pointCommand(point) {
  return `${point.x.toFixed(2)} ${point.y.toFixed(2)}`;
}

function toClippedSvgPath(points, rect) {
  if (points.length < 2) return '';
  if (!rect) {
    const finitePoints = points.filter(finitePoint);
    if (finitePoints.length < 2) return '';
    return finitePoints.reduce((value, point, index) => (
      `${value}${index === 0 ? 'M' : ' L'} ${pointCommand(point)}`
    ), '');
  }

  let value = '';
  let previousEnd = null;
  for (let index = 1; index < points.length; index += 1) {
    const start = points[index - 1];
    const end = points[index];
    if (!finitePoint(start) || !finitePoint(end)) {
      previousEnd = null;
      continue;
    }

    const clipped = clipSegmentToRect(start, end, rect);
    if (!clipped) {
      previousEnd = null;
      continue;
    }

    const [clippedStart, clippedEnd] = clipped;
    if (!samePoint(previousEnd, clippedStart)) {
      value += `${value ? ' ' : ''}M ${pointCommand(clippedStart)}`;
    }
    value += ` L ${pointCommand(clippedEnd)}`;
    previousEnd = clippedEnd;
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
    const clipRect = viewportRect(map);

    routePaths.forEach((routePath) => {
      const { element, path } = routePath;
      const points = projectedPoints(path, projection);
      const d = toClippedSvgPath(points, clipRect);
      if (d) {
        if (routePath.lastPathValue !== d) {
          element.setAttribute('d', d);
          routePath.lastPathValue = d;
        }
        if (!routePath.visible) {
          element.style.display = '';
          routePath.visible = true;
        }
      } else {
        if (routePath.lastPathValue) {
          element.removeAttribute('d');
          routePath.lastPathValue = '';
        }
        if (routePath.visible) {
          element.style.display = 'none';
          routePath.visible = false;
        }
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
      visible: true,
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
