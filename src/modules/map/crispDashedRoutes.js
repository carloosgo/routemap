const DEFAULT_DASH_PX = 4;
const DEFAULT_GAP_PX = 6;
const DEFAULT_STROKE_WEIGHT = 2;
const ARROW_FRACTIONS = [0.24, 0.5, 0.76];
const SVG_NS = 'http://www.w3.org/2000/svg';

function finitePoint(point) {
  return Boolean(point && Number.isFinite(point.x) && Number.isFinite(point.y));
}

function projectedPoints(path, projection, maps) {
  return (path || [])
    .map((point) => projection.fromLatLngToDivPixel(
      point instanceof maps.LatLng ? point : new maps.LatLng(point)
    ))
    .filter(finitePoint);
}

function toSvgPath(points) {
  if (points.length < 2) return '';

  return points
    .map((point, index) => `${index === 0 ? 'M' : 'L'} ${point.x.toFixed(2)} ${point.y.toFixed(2)}`)
    .join(' ');
}

function arrowPlacement(points, fraction) {
  if (points.length < 2) return null;

  const segments = [];
  let totalLength = 0;
  for (let index = 1; index < points.length; index += 1) {
    const start = points[index - 1];
    const end = points[index];
    const dx = end.x - start.x;
    const dy = end.y - start.y;
    const length = Math.hypot(dx, dy);
    if (length <= 0) continue;
    segments.push({ start, end, dx, dy, length });
    totalLength += length;
  }
  if (!segments.length || totalLength <= 0) return null;

  const target = totalLength * Math.min(1, Math.max(0, fraction));
  let walked = 0;
  for (const segment of segments) {
    if (walked + segment.length >= target) {
      const ratio = (target - walked) / segment.length;
      return {
        x: segment.start.x + segment.dx * ratio,
        y: segment.start.y + segment.dy * ratio,
        angle: Math.atan2(segment.dy, segment.dx) * 180 / Math.PI,
      };
    }
    walked += segment.length;
  }

  const last = segments[segments.length - 1];
  return {
    x: last.end.x,
    y: last.end.y,
    angle: Math.atan2(last.dy, last.dx) * 180 / Math.PI,
  };
}

function createRoutePath(color) {
  const path = document.createElementNS(SVG_NS, 'path');
  path.setAttribute('fill', 'none');
  path.setAttribute('stroke', color || '#111111');
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
  arrow.setAttribute('d', 'M -3.6 -2.7 L 1 0 L -3.6 2.7');
  arrow.setAttribute('fill', 'none');
  arrow.setAttribute('stroke', '#000000');
  arrow.setAttribute('stroke-width', '1.35');
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
    return { dispose() {} };
  }

  const overlay = new maps.OverlayView();
  let svg = null;
  let routePaths = [];

  overlay.onAdd = () => {
    const pane = overlay.getPanes?.()?.overlayLayer;
    if (!pane) return;

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

    routePaths = routes.map((route) => {
      const element = createRoutePath(route.color);
      const arrows = ARROW_FRACTIONS.map(() => createDirectionArrow());
      svg.append(element, ...arrows);
      return { element, arrows, path: route.path || [] };
    });

    pane.append(svg);
  };

  overlay.draw = () => {
    const projection = overlay.getProjection?.();
    if (!projection) return;

    routePaths.forEach(({ element, arrows, path }) => {
      const points = projectedPoints(path, projection, maps);
      const d = toSvgPath(points);
      if (d) {
        element.setAttribute('d', d);
        element.style.display = '';
      } else {
        element.removeAttribute('d');
        element.style.display = 'none';
      }

      arrows.forEach((arrow, index) => {
        const placement = arrowPlacement(points, ARROW_FRACTIONS[index]);
        if (placement) {
          arrow.setAttribute(
            'transform',
            `translate(${placement.x.toFixed(2)} ${placement.y.toFixed(2)}) rotate(${placement.angle.toFixed(2)})`
          );
          arrow.style.display = '';
        } else {
          arrow.removeAttribute('transform');
          arrow.style.display = 'none';
        }
      });
    });
  };

  overlay.onRemove = () => {
    svg?.remove();
    svg = null;
    routePaths = [];
  };

  overlay.setMap(map);

  return {
    dispose() {
      overlay.setMap(null);
    },
  };
}
