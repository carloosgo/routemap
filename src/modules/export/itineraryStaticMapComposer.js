import { findCountryContainingPoint, loadWorldAtlasCountries } from './worldAtlasGeometry.js';
import { projectToStaticMap } from './itineraryStaticMapViewport.js';

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

function hexToRgba(hex, alpha) {
  const match = /^#?([0-9a-f]{6})$/i.exec(String(hex || ''));
  const value = match?.[1] || '7b8b96';
  return `rgba(${parseInt(value.slice(0, 2), 16)}, ${parseInt(value.slice(2, 4), 16)}, ${parseInt(value.slice(4, 6), 16)}, ${alpha})`;
}

function countryAssignments(model, countries) {
  const assignments = new Map();
  (Array.isArray(model?.countries) ? model.countries : []).forEach((visited) => {
    const city = visited?.city;
    if (!Number.isFinite(Number(city?.lat)) || !Number.isFinite(Number(city?.lon))) return;
    const country = findCountryContainingPoint(countries, Number(city.lon), Number(city.lat));
    if (!country || assignments.has(country.id)) return;
    assignments.set(country.id, visited.color || '#7b8b96');
  });
  return assignments;
}

function drawCountryTint(ctx, country, viewport, scale, color) {
  ctx.save();
  ctx.fillStyle = hexToRgba(color, 0.16);
  country.polygons.forEach((polygon) => {
    ctx.beginPath();
    polygon.forEach((ring) => {
      ring.forEach(([lon, lat], index) => {
        const [x, y] = projectToStaticMap(lon, lat, viewport);
        if (index === 0) ctx.moveTo(x * scale, y * scale);
        else ctx.lineTo(x * scale, y * scale);
      });
      ctx.closePath();
    });
    ctx.fill('evenodd');
  });
  ctx.restore();
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
  ctx.lineWidth = 1.7 * scale;
  ctx.beginPath();
  ctx.moveTo(x, y - (3 * scale));
  ctx.lineTo(x, y + (13 * scale));
  ctx.stroke();
  ctx.fillStyle = '#2fa6a0';
  ctx.beginPath();
  ctx.moveTo(x, y - (3 * scale));
  ctx.lineTo(x + (10 * scale), y);
  ctx.lineTo(x, y + (4 * scale));
  ctx.closePath();
  ctx.fill();
  ctx.restore();
}

function drawMarkers(ctx, entries, viewport, scale) {
  const groups = groupedStops(entries);
  groups.forEach((group, groupIndex) => {
    const [baseX, baseY] = projectToStaticMap(group.lon, group.lat, viewport);
    const spacing = 17;
    const totalWidth = Math.max(0, (group.entries.length - 1) * spacing);
    group.entries.forEach((entry, index) => {
      const x = (baseX - (totalWidth / 2) + (index * spacing)) * scale;
      const y = baseY * scale;
      if (entry.isOrigin) {
        ctx.fillStyle = '#ffffff';
        ctx.strokeStyle = '#78858d';
        ctx.lineWidth = 1.4 * scale;
        ctx.beginPath();
        ctx.arc(x, y, 7.2 * scale, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();
        ctx.fillStyle = '#78858d';
        ctx.beginPath();
        ctx.arc(x, y, 2.3 * scale, 0, Math.PI * 2);
        ctx.fill();
        return;
      }
      ctx.fillStyle = entry.color || '#63727a';
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 1.5 * scale;
      ctx.beginPath();
      ctx.arc(x, y, 8.2 * scale, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
      ctx.fillStyle = '#ffffff';
      ctx.font = `700 ${(entry.number >= 10 ? 8.1 : 9.1) * scale}px Arial, sans-serif`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(String(entry.number ?? ''), x, y + (0.4 * scale));
    });
    if (groupIndex === groups.length - 1) {
      drawFinishFlag(
        ctx,
        (baseX + (totalWidth / 2) + 10) * scale,
        (baseY + 1) * scale,
        scale
      );
    }
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
  const countries = await loadWorldAtlasCountries();
  const assignments = countryAssignments(model, countries);
  countries.forEach((country) => {
    const color = assignments.get(country.id);
    if (color) drawCountryTint(ctx, country, baseMap.viewport, scale, color);
  });

  const entries = routeEntries(model);
  drawRoute(ctx, entries, baseMap.viewport, scale);
  drawMarkers(ctx, entries, baseMap.viewport, scale);

  return {
    bytes: await canvasToJpeg(canvas),
    pixelWidth: canvas.width,
    pixelHeight: canvas.height,
  };
}