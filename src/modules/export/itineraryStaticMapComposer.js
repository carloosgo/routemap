import { projectToStaticMap } from './itineraryStaticMapViewport.js';

const SYSTEM_TEAL = '#0e4f63';
const MARKER_RADIUS = 6.35;
const ORIGIN_RADIUS = 5.8;
const MARKER_SPACING = 14;
const LABEL_FONT_SIZE = 9.2;
const LABEL_HEIGHT = 18;
const LABEL_PADDING_X = 7;
const LABEL_GAP = 7;
const LABEL_RADIUS = 6;
const ATTRIBUTION_GUARD = 27;

function routeEntries(model) {
  return [
    ...(model?.hasOrigin ? [{ ...model.origin, isOrigin: true }] : []),
    ...(Array.isArray(model?.stops) ? model.stops.map((stop) => ({ ...stop, isOrigin: false })) : []),
  ].filter((entry) => Number.isFinite(Number(entry.lat)) && Number.isFinite(Number(entry.lon)));
}

function blobUrl(bytes, mimeType) {
  const BlobCtor = globalThis.Blob;
  const URLApi = globalThis.URL;
  if (typeof BlobCtor !== 'function' || !URLApi?.createObjectURL) throw new Error('Map image loading unavailable');
  const url = URLApi.createObjectURL(new BlobCtor([bytes], { type: mimeType || 'image/jpeg' }));
  return { url, revoke: () => URLApi.revokeObjectURL(url) };
}

function loadImage(src) {
  return new Promise((resolve, reject) => {
    const ImageCtor = globalThis.Image;
    if (typeof ImageCtor !== 'function') {
      reject(new Error('Image unavailable'));
      return;
    }
    const image = new ImageCtor();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error('Static map image could not be decoded'));
    image.src = src;
  });
}

function groupedStops(entries) {
  const groups = [];
  const byCoordinate = new Map();
  entries.forEach((entry) => {
    const key = `${Number(entry.lat).toFixed(5)},${Number(entry.lon).toFixed(5)}`;
    let group = byCoordinate.get(key);
    if (!group) {
      group = { lat: Number(entry.lat), lon: Number(entry.lon), entries: [] };
      byCoordinate.set(key, group);
      groups.push(group);
    }
    group.entries.push(entry);
  });
  return groups;
}

function drawRoute(ctx, entries, viewport, scale) {
  if (entries.length < 2) return;
  ctx.save();
  ctx.strokeStyle = '#4d565c';
  ctx.lineWidth = 1.7 * scale;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.setLineDash([5 * scale, 6 * scale]);
  ctx.beginPath();
  entries.forEach((entry, index) => {
    const [x, y] = projectToStaticMap(entry.lon, entry.lat, viewport);
    if (index === 0) ctx.moveTo(x * scale, y * scale);
    else ctx.lineTo(x * scale, y * scale);
  });
  ctx.stroke();
  ctx.restore();
}

function drawFinishFlag(ctx, x, y, scale) {
  ctx.save();
  ctx.strokeStyle = '#147568';
  ctx.lineWidth = 1.5 * scale;
  ctx.beginPath();
  ctx.moveTo(x, y - (3 * scale));
  ctx.lineTo(x, y + (12 * scale));
  ctx.stroke();
  ctx.fillStyle = '#2fa6a0';
  ctx.beginPath();
  ctx.moveTo(x, y - (3 * scale));
  ctx.lineTo(x + (9 * scale), y);
  ctx.lineTo(x, y + (4 * scale));
  ctx.closePath();
  ctx.fill();
  ctx.restore();
}

function roundedRectPath(ctx, x, y, width, height, radius) {
  const r = Math.max(0, Math.min(radius, width / 2, height / 2));
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + width - r, y);
  ctx.quadraticCurveTo(x + width, y, x + width, y + r);
  ctx.lineTo(x + width, y + height - r);
  ctx.quadraticCurveTo(x + width, y + height, x + width - r, y + height);
  ctx.lineTo(x + r, y + height);
  ctx.quadraticCurveTo(x, y + height, x, y + height - r);
  ctx.lineTo(x, y + r);
  ctx.quadraticCurveTo(x, y, x + r, y);
  ctx.closePath();
}

function normalizedHex(value, fallback = SYSTEM_TEAL) {
  const match = /^#?([0-9a-f]{6})$/i.exec(String(value || '').trim());
  return match ? `#${match[1]}` : fallback;
}

function readableTextColor(background) {
  const hex = normalizedHex(background).slice(1);
  const r = parseInt(hex.slice(0, 2), 16);
  const g = parseInt(hex.slice(2, 4), 16);
  const b = parseInt(hex.slice(4, 6), 16);
  const luminance = ((0.299 * r) + (0.587 * g) + (0.114 * b)) / 255;
  return luminance > 0.67 ? '#10232d' : '#ffffff';
}

function boxesIntersect(left, right, gap = 0) {
  return !(
    left.x + left.width + gap <= right.x
    || right.x + right.width + gap <= left.x
    || left.y + left.height + gap <= right.y
    || right.y + right.height + gap <= left.y
  );
}

function clampBox(box, canvas, scale) {
  const margin = 6 * scale;
  const bottomGuard = ATTRIBUTION_GUARD * scale;
  const maxX = Math.max(margin, canvas.width - margin - box.width);
  const maxY = Math.max(margin, canvas.height - bottomGuard - box.height);
  return {
    ...box,
    x: Math.max(margin, Math.min(maxX, box.x)),
    y: Math.max(margin, Math.min(maxY, box.y)),
  };
}

function labelCandidates(baseX, baseY, clusterHalfWidth, width, height, scale) {
  const gap = LABEL_GAP * scale;
  const verticalGap = 7 * scale;
  return [
    { x: baseX + clusterHalfWidth + gap, y: baseY - (height / 2) },
    { x: baseX - clusterHalfWidth - gap - width, y: baseY - (height / 2) },
    { x: baseX + clusterHalfWidth + gap, y: baseY - height - verticalGap },
    { x: baseX + clusterHalfWidth + gap, y: baseY + verticalGap },
    { x: baseX - clusterHalfWidth - gap - width, y: baseY - height - verticalGap },
    { x: baseX - clusterHalfWidth - gap - width, y: baseY + verticalGap },
  ];
}

function chooseLabelBox({ baseX, baseY, clusterHalfWidth, width, height, canvas, scale, occupied }) {
  const candidates = labelCandidates(baseX, baseY, clusterHalfWidth, width, height, scale)
    .map((candidate) => clampBox({ ...candidate, width, height }, canvas, scale));
  return candidates.find((candidate) => (
    !occupied.some((placed) => boxesIntersect(candidate, placed, 3 * scale))
  )) || candidates[0];
}

function drawCityLabel(ctx, group, geometry, canvas, scale, occupied) {
  const cityName = String(group.entries.find((entry) => entry.name)?.name || '').trim();
  if (!cityName) return;
  const accentEntry = group.entries.find((entry) => !entry.isOrigin) || group.entries[0];
  const color = normalizedHex(accentEntry?.color, SYSTEM_TEAL);
  const fontSize = LABEL_FONT_SIZE * scale;
  const labelHeight = LABEL_HEIGHT * scale;
  ctx.save();
  ctx.font = `700 ${fontSize}px Arial, sans-serif`;
  const labelWidth = Math.ceil(ctx.measureText(cityName).width + (LABEL_PADDING_X * 2 * scale));
  const box = chooseLabelBox({
    baseX: geometry.baseX,
    baseY: geometry.baseY,
    clusterHalfWidth: geometry.clusterHalfWidth,
    width: labelWidth,
    height: labelHeight,
    canvas,
    scale,
    occupied,
  });

  ctx.shadowColor = 'rgba(20, 33, 40, 0.18)';
  ctx.shadowBlur = 2.5 * scale;
  ctx.shadowOffsetY = 1 * scale;
  ctx.fillStyle = color;
  ctx.strokeStyle = 'rgba(255,255,255,0.92)';
  ctx.lineWidth = 1.1 * scale;
  roundedRectPath(ctx, box.x, box.y, box.width, box.height, LABEL_RADIUS * scale);
  ctx.fill();
  ctx.shadowColor = 'transparent';
  ctx.stroke();

  ctx.fillStyle = readableTextColor(color);
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(cityName, box.x + (box.width / 2), box.y + (box.height / 2) + (0.25 * scale));
  ctx.restore();
  occupied.push(box);
}

function drawMarkers(ctx, entries, viewport, scale, canvas) {
  const groups = groupedStops(entries);
  const occupiedLabels = [];
  const geometries = [];

  groups.forEach((group, groupIndex) => {
    const [projectedX, projectedY] = projectToStaticMap(group.lon, group.lat, viewport);
    const spacing = MARKER_SPACING;
    const totalWidth = Math.max(0, (group.entries.length - 1) * spacing);
    const baseX = projectedX * scale;
    const baseY = projectedY * scale;
    const clusterHalfWidth = ((totalWidth / 2) + MARKER_RADIUS) * scale;

    group.entries.forEach((entry, index) => {
      const x = (projectedX - (totalWidth / 2) + (index * spacing)) * scale;
      const y = baseY;
      if (entry.isOrigin) {
        ctx.fillStyle = '#ffffff';
        ctx.strokeStyle = '#78858d';
        ctx.lineWidth = 1.25 * scale;
        ctx.beginPath();
        ctx.arc(x, y, ORIGIN_RADIUS * scale, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();
        ctx.fillStyle = '#78858d';
        ctx.beginPath();
        ctx.arc(x, y, 2 * scale, 0, Math.PI * 2);
        ctx.fill();
        return;
      }
      ctx.fillStyle = normalizedHex(entry.color, '#63727a');
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 1.35 * scale;
      ctx.beginPath();
      ctx.arc(x, y, MARKER_RADIUS * scale, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
      ctx.fillStyle = '#ffffff';
      ctx.font = `700 ${(Number(entry.number) >= 10 ? 6.8 : 7.7) * scale}px Arial, sans-serif`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(String(entry.number ?? ''), x, y + (0.25 * scale));
    });

    geometries.push({ group, baseX, baseY, clusterHalfWidth });
    if (groupIndex === groups.length - 1) {
      drawFinishFlag(
        ctx,
        (projectedX + (totalWidth / 2) + 8) * scale,
        (projectedY + 1) * scale,
        scale
      );
    }
  });

  geometries.forEach(({ group, baseX, baseY, clusterHalfWidth }) => {
    drawCityLabel(ctx, group, { baseX, baseY, clusterHalfWidth }, canvas, scale, occupiedLabels);
  });
}

function canvasToJpeg(canvas) {
  return new Promise((resolve, reject) => {
    canvas.toBlob(async (blob) => {
      if (!blob) {
        reject(new Error('Itinerary map could not be encoded'));
        return;
      }
      resolve(new Uint8Array(await blob.arrayBuffer()));
    }, 'image/jpeg', 0.94);
  });
}

export async function composeItineraryStaticMap(model, baseMap) {
  const documentRef = globalThis.document;
  if (!documentRef?.createElement) throw new Error('Canvas unavailable');
  const canvas = documentRef.createElement('canvas');
  canvas.width = baseMap.pixelWidth;
  canvas.height = baseMap.pixelHeight;
  const ctx = canvas.getContext('2d');
  const resource = blobUrl(baseMap.bytes, baseMap.mimeType);
  try {
    const image = await loadImage(resource.url);
    ctx.drawImage(image, 0, 0, canvas.width, canvas.height);
  } finally {
    resource.revoke();
  }

  const scale = canvas.width / baseMap.viewport.width;
  const entries = routeEntries(model);
  drawRoute(ctx, entries, baseMap.viewport, scale);
  drawMarkers(ctx, entries, baseMap.viewport, scale, canvas);

  return {
    bytes: await canvasToJpeg(canvas),
    pixelWidth: canvas.width,
    pixelHeight: canvas.height,
  };
}
