const DEFAULT_DASH_PX = 4;
const DEFAULT_GAP_PX = 6;
const DEFAULT_STROKE_WEIGHT = 2;
const SVG_NS = 'http://www.w3.org/2000/svg';

function finitePoint(point) {
  return Boolean(point && Number.isFinite(point.x) && Number.isFinite(point.y));
}

function toSvgPath(path, projection, maps) {
  const points = (path || [])
    .map((point) => projection.fromLatLngToDivPixel(
      point instanceof maps.LatLng ? point : new maps.LatLng(point)
    ))
    .filter(finitePoint);

  if (points.length < 2) return '';

  return points
    .map((point, index) => `${index === 0 ? 'M' : 'L'} ${point.x.toFixed(2)} ${point.y.toFixed(2)}`)
    .join(' ');
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
      svg.append(element);
      return { element, path: route.path || [] };
    });

    pane.append(svg);
  };

  overlay.draw = () => {
    const projection = overlay.getProjection?.();
    if (!projection) return;

    routePaths.forEach(({ element, path }) => {
      const d = toSvgPath(path, projection, maps);
      if (d) {
        element.setAttribute('d', d);
        element.style.display = '';
      } else {
        element.removeAttribute('d');
        element.style.display = 'none';
      }
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
