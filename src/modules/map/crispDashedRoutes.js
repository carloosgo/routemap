const DEFAULT_DASH_PX = 4;
const DEFAULT_GAP_PX = 6;
const DEFAULT_STROKE_WEIGHT = 2;
const SETTLE_DELAY_MS = 140;

function finitePoint(point) {
  return Boolean(point && Number.isFinite(point.x) && Number.isFinite(point.y));
}

function distance(a, b) {
  return Math.hypot(b.x - a.x, b.y - a.y);
}

function pathMetrics(points) {
  const cumulative = [0];
  for (let index = 1; index < points.length; index += 1) {
    cumulative.push(cumulative[index - 1] + distance(points[index - 1], points[index]));
  }
  return cumulative;
}

function pointAtDistance(points, cumulative, target) {
  if (target <= 0) return points[0];
  const total = cumulative[cumulative.length - 1];
  if (target >= total) return points[points.length - 1];

  let index = 1;
  while (index < cumulative.length && cumulative[index] < target) index += 1;

  const start = points[index - 1];
  const end = points[index];
  const segmentStart = cumulative[index - 1];
  const segmentLength = cumulative[index] - segmentStart;
  const ratio = segmentLength > 0 ? (target - segmentStart) / segmentLength : 0;

  return {
    x: start.x + ((end.x - start.x) * ratio),
    y: start.y + ((end.y - start.y) * ratio),
  };
}

export function pixelDashSegments(points, dashPx = DEFAULT_DASH_PX, gapPx = DEFAULT_GAP_PX) {
  const cleanPoints = (points || []).filter(finitePoint);
  if (cleanPoints.length < 2) return [];

  const cumulative = pathMetrics(cleanPoints);
  const total = cumulative[cumulative.length - 1];
  if (total <= 0) return [];

  const dashLength = Math.max(1, Number(dashPx) || DEFAULT_DASH_PX);
  const gapLength = Math.max(1, Number(gapPx) || DEFAULT_GAP_PX);
  const step = dashLength + gapLength;
  const segments = [];

  for (let startDistance = 0; startDistance < total; startDistance += step) {
    const endDistance = Math.min(startDistance + dashLength, total);
    const segment = [pointAtDistance(cleanPoints, cumulative, startDistance)];

    for (let index = 1; index < cleanPoints.length - 1; index += 1) {
      if (cumulative[index] > startDistance && cumulative[index] < endDistance) {
        segment.push(cleanPoints[index]);
      }
    }

    segment.push(pointAtDistance(cleanPoints, cumulative, endDistance));
    if (segment.length >= 2) segments.push(segment);
  }

  return segments;
}

function mapSizeKey(map) {
  const node = map?.getDiv?.();
  if (!node) return '';
  return `${Math.round(node.clientWidth || 0)}x${Math.round(node.clientHeight || 0)}`;
}

export function createCrispDashedRoutes({
  maps,
  map,
  routes = [],
}) {
  if (!maps?.OverlayView || !maps?.Polyline || !map) {
    return { dispose() {} };
  }

  const overlay = new maps.OverlayView();
  let polylines = [];
  let disposed = false;
  let frame = 0;
  let settleTimer = 0;
  let hasRendered = false;
  let lastRenderedZoom = null;
  let lastRenderedSize = '';
  let resizeObserver = null;

  const clearLines = (lines) => {
    lines.forEach((line) => line.setMap(null));
  };

  const clear = () => {
    clearLines(polylines);
    polylines = [];
  };

  const redraw = () => {
    frame = 0;
    if (disposed) return;

    const projection = overlay.getProjection?.();
    const size = mapSizeKey(map);
    if (!projection || !size || size === '0x0') return;

    const nextPolylines = [];
    routes.forEach(({ path = [], color = '#111111' }) => {
      const pixels = path
        .map((point) => projection.fromLatLngToDivPixel(
          point instanceof maps.LatLng ? point : new maps.LatLng(point)
        ))
        .filter(finitePoint)
        .map((point) => ({ x: point.x, y: point.y }));

      pixelDashSegments(pixels, DEFAULT_DASH_PX, DEFAULT_GAP_PX).forEach((pixelSegment) => {
        const dashPath = pixelSegment
          .map((point) => projection.fromDivPixelToLatLng(new maps.Point(point.x, point.y)))
          .filter(Boolean);
        if (dashPath.length < 2) return;

        nextPolylines.push(new maps.Polyline({
          map,
          path: dashPath,
          strokeColor: color,
          strokeOpacity: 1,
          strokeWeight: DEFAULT_STROKE_WEIGHT,
          clickable: false,
          geodesic: false,
          zIndex: 2,
        }));
      });
    });

    const previousPolylines = polylines;
    polylines = nextPolylines;
    clearLines(previousPolylines);

    lastRenderedZoom = map.getZoom?.();
    lastRenderedSize = size;
    hasRendered = true;
  };

  const scheduleRedraw = (delay = SETTLE_DELAY_MS) => {
    if (disposed) return;
    clearTimeout(settleTimer);
    settleTimer = setTimeout(() => {
      if (disposed || frame) return;
      frame = requestAnimationFrame(() => {
        frame = requestAnimationFrame(redraw);
      });
    }, delay);
  };

  const markDirty = () => {
    hasRendered = false;
  };

  overlay.onAdd = () => {};
  overlay.onRemove = clear;
  overlay.draw = () => {
    if (disposed || !hasRendered) return;
    const zoom = map.getZoom?.();
    const size = mapSizeKey(map);
    if (zoom !== lastRenderedZoom || size !== lastRenderedSize) {
      markDirty();
    }
  };
  overlay.setMap(map);

  const zoomListener = map.addListener?.('zoom_changed', markDirty);
  const idleListener = map.addListener?.('idle', () => scheduleRedraw());
  const tilesListener = map.addListener?.('tilesloaded', () => scheduleRedraw(80));

  const mapNode = map.getDiv?.();
  if (mapNode && typeof globalThis.ResizeObserver !== 'undefined') {
    resizeObserver = new globalThis.ResizeObserver(markDirty);
    resizeObserver.observe(mapNode);
  }

  return {
    dispose() {
      disposed = true;
      clearTimeout(settleTimer);
      settleTimer = 0;
      if (frame) cancelAnimationFrame(frame);
      frame = 0;
      zoomListener?.remove?.();
      idleListener?.remove?.();
      tilesListener?.remove?.();
      resizeObserver?.disconnect();
      resizeObserver = null;
      overlay.setMap(null);
      clear();
    },
  };
}
