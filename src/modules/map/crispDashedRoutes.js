const DEFAULT_DASH_PX = 4;
const DEFAULT_GAP_PX = 6;
const DEFAULT_STROKE_WEIGHT = 2;
const DASH_CYCLE_PX = DEFAULT_DASH_PX + DEFAULT_GAP_PX;
const DASH_GAP_CENTER_PX = DEFAULT_DASH_PX + (DEFAULT_GAP_PX / 2);
const ARROW_FRACTIONS = [0.33, 0.67];
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

function snapToDashGap(target, totalLength) {
  if (totalLength <= DASH_CYCLE_PX) return target;

  const cycleIndex = Math.round((target - DASH_GAP_CENTER_PX) / DASH_CYCLE_PX);
  const snapped = DASH_GAP_CENTER_PX + (cycleIndex * DASH_CYCLE_PX);
  const minDistance = DASH_GAP_CENTER_PX;
  const maxDistance = Math.max(minDistance, totalLength - (DEFAULT_GAP_PX / 2));
  return Math.min(maxDistance, Math.max(minDistance, snapped));
}

function arrowPlacement(points, fraction) {
  if (points.length < 2) return null;

  let totalLength = 0;
  const lengths = new Array(points.length - 1);
  for (let index = 1; index < points.length; index += 1) {
    const start = points[index - 1];
    const end = points[index];
    const length = Math.hypot(end.x - start.x, end.y - start.y);
    lengths[index - 1] = length;
    totalLength += length;
  }
  if (totalLength <= 0) return null;

  const rawTarget = totalLength * Math.min(1, Math.max(0, fraction));
  const target = snapToDashGap(rawTarget, totalLength);
  let walked = 0;
  for (let index = 1; index < points.length; index += 1) {
    const length = lengths[index - 1];
    if (length <= 0) continue;
    const start = points[index - 1];
    const end = points[index];
    const dx = end.x - start.x;
    const dy = end.y - start.y;
    if (walked + length >= target) {
      const ratio = (target - walked) / length;
      return {
        x: start.x + dx * ratio,
        y: start.y + dy * ratio,
        angle: Math.atan2(dy, dx) * 180 / Math.PI,
      };
    }
    walked += length;
  }

  const lastIndex = points.length - 1;
  const start = points[lastIndex - 1];
  const end = points[lastIndex];
  return {
    x: end.x,
    y: end.y,
    angle: Math.atan2(end.y - start.y, end.x - start.x) * 180 / Math.PI,
  };
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

function createDirectionArrow() {
  const arrow = document.createElementNS(SVG_NS, 'path');
  arrow.setAttribute('d', 'M -2.2 -1.65 L 0.6 0 L -2.2 1.65');
  arrow.setAttribute('fill', 'none');
  arrow.setAttribute('stroke', '#000000');
  arrow.setAttribute('stroke-width', '1.7');
  arrow.setAttribute('stroke-linecap', 'round');
  arrow.setAttribute('stroke-linejoin', 'round');
  arrow.setAttribute('vector-effect', 'non-scaling-stroke');
  arrow.setAttribute('shape-rendering', 'geometricPrecision');
  arrow.style.pointerEvents = 'none';
  return arrow;
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

  const removeRoutePath = ({ element, arrows }) => {
    element.remove();
    arrows.forEach((arrow) => arrow.remove());
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
      const { element, arrows, path } = routePath;
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

      arrows.forEach((arrow, index) => {
        const placement = arrowPlacement(points, ARROW_FRACTIONS[index]);
        if (placement) {
          const transform = `translate(${placement.x.toFixed(2)} ${placement.y.toFixed(2)}) rotate(${placement.angle.toFixed(2)})`;
          if (routePath.lastArrowTransforms[index] !== transform) {
            arrow.setAttribute('transform', transform);
            routePath.lastArrowTransforms[index] = transform;
          }
          arrow.style.display = '';
        } else {
          if (routePath.lastArrowTransforms[index]) {
            arrow.removeAttribute('transform');
            routePath.lastArrowTransforms[index] = '';
          }
          arrow.style.display = 'none';
        }
      });
    });
  };

  const scheduleRender = () => {
    if (disposed || drawFrame) return;
    drawFrame = requestAnimationFrame(render);
  };

  const createRoutePathState = (route) => {
    const element = createRoutePath();
    const arrows = ARROW_FRACTIONS.map(() => createDirectionArrow());
    svg.append(element, ...arrows);
    return {
      element,
      arrows,
      path: route.path,
      lastPathValue: '',
      lastArrowTransforms: ['', ''],
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
