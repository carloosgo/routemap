const DEFAULT_DASH_PX = 4;
const DEFAULT_GAP_PX = 6;
const DEFAULT_STROKE_WEIGHT = 2;
const DASH_CYCLE_PX = DEFAULT_DASH_PX + DEFAULT_GAP_PX;
const DASH_GAP_CENTER_PX = DEFAULT_DASH_PX + (DEFAULT_GAP_PX / 2);
const ARROW_FRACTIONS = [0.33, 0.67];
const SVG_NS = 'http://www.w3.org/2000/svg';

let overlaySequence = 0;

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

  const rawTarget = totalLength * Math.min(1, Math.max(0, fraction));
  const target = snapToDashGap(rawTarget, totalLength);
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

function createArrowCutout() {
  const cutout = document.createElementNS(SVG_NS, 'path');
  cutout.setAttribute('d', 'M -3.1 0 L 1.5 0');
  cutout.setAttribute('fill', 'none');
  cutout.setAttribute('stroke', '#000000');
  cutout.setAttribute('stroke-width', '4.4');
  cutout.setAttribute('stroke-linecap', 'round');
  return cutout;
}

function createRouteMask(defs, maskId) {
  const mask = document.createElementNS(SVG_NS, 'mask');
  mask.setAttribute('id', maskId);
  mask.setAttribute('maskUnits', 'userSpaceOnUse');
  mask.setAttribute('maskContentUnits', 'userSpaceOnUse');
  mask.setAttribute('x', '-100000');
  mask.setAttribute('y', '-100000');
  mask.setAttribute('width', '200000');
  mask.setAttribute('height', '200000');

  const visibleArea = document.createElementNS(SVG_NS, 'rect');
  visibleArea.setAttribute('x', '-100000');
  visibleArea.setAttribute('y', '-100000');
  visibleArea.setAttribute('width', '200000');
  visibleArea.setAttribute('height', '200000');
  visibleArea.setAttribute('fill', '#ffffff');

  const cutouts = ARROW_FRACTIONS.map(() => createArrowCutout());
  mask.append(visibleArea, ...cutouts);
  defs.append(mask);
  return cutouts;
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
  const overlayId = overlaySequence += 1;
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

    const defs = document.createElementNS(SVG_NS, 'defs');
    svg.append(defs);

    routePaths = routes.map((route, routeIndex) => {
      const element = createRoutePath(route.color);
      const maskId = `atlas-route-arrow-mask-${overlayId}-${routeIndex}`;
      const cutouts = createRouteMask(defs, maskId);
      const arrows = ARROW_FRACTIONS.map(() => createDirectionArrow());
      element.setAttribute('mask', `url(#${maskId})`);
      svg.append(element, ...arrows);
      return { element, arrows, cutouts, path: route.path || [] };
    });

    pane.append(svg);
  };

  overlay.draw = () => {
    const projection = overlay.getProjection?.();
    if (!projection) return;

    routePaths.forEach(({ element, arrows, cutouts, path }) => {
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
        const cutout = cutouts[index];
        const placement = arrowPlacement(points, ARROW_FRACTIONS[index]);
        if (placement) {
          const transform = `translate(${placement.x.toFixed(2)} ${placement.y.toFixed(2)}) rotate(${placement.angle.toFixed(2)})`;
          arrow.setAttribute('transform', transform);
          cutout.setAttribute('transform', transform);
          arrow.style.display = '';
          cutout.style.display = '';
        } else {
          arrow.removeAttribute('transform');
          cutout.removeAttribute('transform');
          arrow.style.display = 'none';
          cutout.style.display = 'none';
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
