import { formatMoney } from '../../shared/utils.js';
import { drawCountryFlag } from './countryFlagVector.js';
import {
  PDF_A4_LANDSCAPE,
  VectorPdfPage,
  buildVectorPdf,
  measurePdfText,
  mixHex,
  wrapPdfText,
} from './pdfVectorDocument.js';
import {
  findCountryContainingPoint,
  loadWorldAtlasCountries,
} from './worldAtlasGeometry.js';

const PAGE = PDF_A4_LANDSCAPE;
const MAP_SEA = '#e5f2f5';
const MAP_LAND = '#f5f3ed';
const MAP_BORDER = '#ccd3d6';
const TEXT = '#2f3b42';
const MUTED = '#68757d';
const LIGHT_BORDER = '#dce2e5';

function validCoordinate(city) {
  return Boolean(
    city
    && Number.isFinite(Number(city.lat))
    && Math.abs(Number(city.lat)) <= 90
    && Number.isFinite(Number(city.lon))
    && Math.abs(Number(city.lon)) <= 180
  );
}

function formatDate(iso, locale) {
  if (!iso) return '';
  const date = new Date(`${iso}T00:00:00Z`);
  if (Number.isNaN(date.getTime())) return String(iso);
  try {
    return new Intl.DateTimeFormat(locale, {
      day: 'numeric',
      month: 'short',
      timeZone: 'UTC',
    }).format(date).replace(/\./g, '');
  } catch {
    return String(iso);
  }
}

function formatDateRange(startDate, endDate, locale, fallback = '') {
  const start = formatDate(startDate, locale);
  const end = formatDate(endDate, locale);
  if (start && end && start !== end) return `${start} – ${end}`;
  return start || end || fallback;
}

function entryDateLines(entry, locale) {
  if (entry.isOrigin) return [formatDate(entry.departureDate, locale)].filter(Boolean);
  const start = formatDate(entry.startDate, locale);
  const end = formatDate(entry.endDate, locale);
  if (start && end && start !== end) return [start, end];
  return [start || end].filter(Boolean);
}

function routeEntries(model) {
  return [
    ...(model.hasOrigin ? [{ ...model.origin, isOrigin: true }] : []),
    ...model.stops.map((stop) => ({ ...stop, isOrigin: false })),
  ];
}

function countryKey(city) {
  const code = String(city?.countryCode || '').trim().toUpperCase();
  if (code) return `code:${code}`;
  const name = String(city?.country || '').trim().toLowerCase();
  return name ? `name:${name}` : '';
}

/* Keep Mercator X and Y in the same unit. Longitudes are expressed in degrees,
   so the projected latitude must also be expressed in Mercator degrees. Mixing
   longitude degrees with raw Mercator radians collapses European routes into a
   thin horizontal strip in wide PDF map boxes. */
function mercatorY(lat) {
  const clamped = Math.max(-84, Math.min(84, Number(lat) || 0));
  const radians = (clamped * Math.PI) / 180;
  return Math.log(Math.tan((Math.PI / 4) + (radians / 2))) * (180 / Math.PI);
}

function normalizeLonNear(lon, reference) {
  let value = Number(lon) || 0;
  while (value - reference > 180) value -= 360;
  while (value - reference < -180) value += 360;
  return value;
}

function unwrapRouteLongitudes(points) {
  if (!points.length) return [];
  const unwrapped = [Number(points[0].lon) || 0];
  for (let index = 1; index < points.length; index += 1) {
    let next = Number(points[index].lon) || 0;
    const previous = unwrapped[index - 1];
    while (next - previous > 180) next -= 360;
    while (next - previous < -180) next += 360;
    unwrapped.push(next);
  }
  return unwrapped;
}

export function createItineraryMapProjection(entries, box) {
  const route = entries.filter(validCoordinate);
  if (!route.length) {
    return {
      project: () => [box.x + (box.width / 2), box.y + (box.height / 2)],
      route,
      referenceLon: 0,
    };
  }

  const longitudes = unwrapRouteLongitudes(route);
  const ys = route.map((entry) => mercatorY(entry.lat));
  let minX = Math.min(...longitudes);
  let maxX = Math.max(...longitudes);
  let minY = Math.min(...ys);
  let maxY = Math.max(...ys);
  const xSpan = Math.max(4.5, maxX - minX);
  const ySpan = Math.max(4.5, maxY - minY);
  const xPad = Math.max(2.5, xSpan * 0.13);
  const yPad = Math.max(2.5, ySpan * 0.13);
  const xMid = (minX + maxX) / 2;
  const yMid = (minY + maxY) / 2;
  minX = xMid - (xSpan / 2) - xPad;
  maxX = xMid + (xSpan / 2) + xPad;
  minY = yMid - (ySpan / 2) - yPad;
  maxY = yMid + (ySpan / 2) + yPad;

  const inner = 12;
  const drawWidth = Math.max(1, box.width - (inner * 2));
  const drawHeight = Math.max(1, box.height - (inner * 2));
  const scale = Math.min(drawWidth / (maxX - minX), drawHeight / (maxY - minY));
  const contentWidth = (maxX - minX) * scale;
  const contentHeight = (maxY - minY) * scale;
  const offsetX = box.x + ((box.width - contentWidth) / 2);
  const offsetY = box.y + ((box.height - contentHeight) / 2);
  const referenceLon = (minX + maxX) / 2;

  return {
    route,
    referenceLon,
    project(lon, lat) {
      const x = normalizeLonNear(lon, referenceLon);
      const y = mercatorY(lat);
      return [
        offsetX + ((x - minX) * scale),
        offsetY + ((maxY - y) * scale),
      ];
    },
  };
}

function ringVisible(points, box) {
  if (!points.length) return false;
  let minX = Infinity;
  let maxX = -Infinity;
  let minY = Infinity;
  let maxY = -Infinity;
  points.forEach(([x, y]) => {
    minX = Math.min(minX, x);
    maxX = Math.max(maxX, x);
    minY = Math.min(minY, y);
    maxY = Math.max(maxY, y);
  });
  return maxX >= box.x - 3
    && minX <= box.x + box.width + 3
    && maxY >= box.y - 3
    && minY <= box.y + box.height + 3;
}

function decimateRing(points, threshold = 0.42) {
  if (points.length < 4) return points;
  const output = [points[0]];
  let previous = points[0];
  for (let index = 1; index < points.length - 1; index += 1) {
    const current = points[index];
    const distance = Math.hypot(current[0] - previous[0], current[1] - previous[1]);
    if (distance >= threshold) {
      output.push(current);
      previous = current;
    }
  }
  output.push(points[points.length - 1]);
  return output;
}

function projectedCountry(country, projection, box) {
  const polygons = [];
  country.polygons.forEach((polygon) => {
    const rings = polygon.map((ring) => decimateRing(
      ring.map(([lon, lat]) => projection.project(lon, lat))
    )).filter((ring) => ring.length >= 3 && ringVisible(ring, box));
    if (rings.length) polygons.push(rings);
  });
  return polygons;
}

function countryCentroid(country) {
  let bestRing = null;
  let bestScore = -Infinity;
  country.polygons.forEach((polygon) => {
    const ring = polygon?.[0];
    if (!ring?.length) return;
    const lons = ring.map((point) => point[0]);
    const lats = ring.map((point) => point[1]);
    const score = (Math.max(...lons) - Math.min(...lons)) * (Math.max(...lats) - Math.min(...lats));
    if (score > bestScore) {
      bestRing = ring;
      bestScore = score;
    }
  });
  if (!bestRing) return null;
  const xs = bestRing.map((point) => point[0]);
  const ys = bestRing.map((point) => point[1]);
  return [
    (Math.min(...xs) + Math.max(...xs)) / 2,
    (Math.min(...ys) + Math.max(...ys)) / 2,
  ];
}

function buildCountryAssignments(entries, countries) {
  const representatives = new Map();
  entries.forEach((entry) => {
    if (!validCoordinate(entry)) return;
    const key = countryKey(entry);
    if (!key || representatives.has(key)) return;
    representatives.set(key, entry);
  });

  const assignments = new Map();
  representatives.forEach((entry) => {
    const country = findCountryContainingPoint(countries, Number(entry.lon), Number(entry.lat));
    if (!country || assignments.has(country.id)) return;
    const stop = entries.find((candidate) => countryKey(candidate) === countryKey(entry) && !candidate.isOrigin)
      || entry;
    assignments.set(country.id, {
      color: stop.color || '#7b8b96',
      label: entry.country || country.name,
      entry,
      country,
    });
  });
  return assignments;
}

function drawMarker(page, entry, x, y) {
  if (entry.isOrigin) {
    page.circle(x, y, 6.2, { fill: '#ffffff', stroke: '#78858d', lineWidth: 1.25 });
    page.circle(x, y, 2.1, { fill: '#78858d' });
    return;
  }
  const radius = 7.1;
  page.circle(x, y, radius, { fill: entry.color || '#5f6f78', stroke: '#ffffff', lineWidth: 1.3 });
  page.text(String(entry.number ?? ''), x, y - 3.7, {
    size: Number(entry.number) >= 10 ? 5.7 : 6.3,
    bold: true,
    color: '#ffffff',
    align: 'center',
  });
}

function drawVectorMap(page, model, countries, box) {
  const entries = routeEntries(model).filter(validCoordinate);
  page.rect(box.x, box.y, box.width, box.height, {
    fill: MAP_SEA,
    stroke: '#d4dfe2',
    lineWidth: 0.7,
    radius: 8,
  });
  if (!entries.length) return;

  const projection = createItineraryMapProjection(entries, box);
  const assignments = buildCountryAssignments(entries, countries);

  page.save();
  page.clipRect(box.x + 0.6, box.y + 0.6, box.width - 1.2, box.height - 1.2);
  countries.forEach((country) => {
    const polygons = projectedCountry(country, projection, box);
    if (!polygons.length) return;
    const assignment = assignments.get(country.id);
    page.multiPolygon(polygons, {
      fill: assignment ? mixHex(assignment.color, '#ffffff', 0.79) : MAP_LAND,
      stroke: MAP_BORDER,
      lineWidth: assignment ? 0.55 : 0.32,
    });
  });

  const routePoints = entries.map((entry) => projection.project(entry.lon, entry.lat));
  if (routePoints.length > 1) {
    page.polyline(routePoints, { stroke: '#545f66', lineWidth: 1.3, dash: [4, 4] });
  }

  assignments.forEach((assignment) => {
    const centroid = countryCentroid(assignment.country);
    if (!centroid) return;
    const [x, y] = projection.project(centroid[0], centroid[1]);
    if (x < box.x + 20 || x > box.x + box.width - 20 || y < box.y + 12 || y > box.y + box.height - 12) return;
    page.text(assignment.label, x, y - 4, {
      size: 7.2,
      bold: true,
      color: '#66737a',
      align: 'center',
      maxWidth: 90,
    });
  });

  entries.forEach((entry) => {
    const [x, y] = projection.project(entry.lon, entry.lat);
    drawMarker(page, entry, x, y);
  });
  page.restore();
}

function drawRouteList(page, model, intlLocale, t, box) {
  const entries = routeEntries(model);
  page.rect(box.x, box.y, box.width, box.height, {
    fill: '#ffffff', stroke: LIGHT_BORDER, lineWidth: 0.75, radius: 8,
  });
  page.text(t('itinerary'), box.x + 12, box.y + 10, {
    size: 12.2, bold: true, color: TEXT,
  });

  const headerHeight = 31;
  const available = box.height - headerHeight - 8;
  const rowHeight = Math.min(30, Math.max(20.5, available / Math.max(1, entries.length)));
  const markerX = box.x + 13;
  const flagX = box.x + 26;
  const cityX = box.x + 44;
  const dateX = box.x + box.width - 83;
  const amountX = box.x + box.width - 9;

  entries.forEach((entry, index) => {
    const rowY = box.y + headerHeight + (index * rowHeight);
    const centerY = rowY + (rowHeight / 2);
    if (index > 0) {
      page.line(box.x + 10, rowY, box.x + box.width - 10, rowY, {
        stroke: '#d9dfe2', lineWidth: 0.45, dash: [1.5, 2.5],
      });
    }
    if (entry.isOrigin) {
      page.circle(markerX, centerY, 4.8, { fill: '#ffffff', stroke: '#7a858d', lineWidth: 1 });
    } else {
      page.circle(markerX, centerY, 5.5, { fill: entry.color || '#63727a' });
      page.text(String(entry.number ?? ''), markerX, centerY - 3.2, {
        size: Number(entry.number) >= 10 ? 4.8 : 5.3,
        bold: true,
        color: '#ffffff',
        align: 'center',
      });
    }

    drawCountryFlag(page, entry.countryCode, flagX, centerY - 4.6, 13.5, 9.2);
    page.text(entry.name || t('city'), cityX, centerY - 5.2, {
      size: 8.5, bold: true, color: TEXT, maxWidth: dateX - cityX - 8,
    });

    const dateLines = entryDateLines(entry, intlLocale);
    if (dateLines.length > 1 && rowHeight >= 25) {
      page.text(dateLines[0], dateX, centerY - 8.1, { size: 6.6, bold: true, color: MUTED });
      page.text(dateLines[1], dateX, centerY + 0.7, { size: 6.6, bold: true, color: MUTED });
    } else if (dateLines[0]) {
      page.text(dateLines[0], dateX, centerY - 4.1, { size: 6.8, bold: true, color: MUTED });
    }

    page.text(formatMoney(entry.total || 0, model.currency, intlLocale), amountX, centerY - 4.1, {
      size: 6.9, bold: true, color: '#414d54', align: 'right', maxWidth: 66,
    });
  });
}

function drawMetrics(page, model, intlLocale, t, box) {
  const metrics = [
    {
      label: t('tripDates'),
      value: formatDateRange(model.summary.startDate, model.summary.endDate, intlLocale, t('noTripDates')),
    },
    { label: t('grandTotal'), value: formatMoney(model.total, model.currency, intlLocale) },
    { label: t(model.summary.countries === 1 ? 'country' : 'countries'), value: String(model.summary.countries) },
    { label: t('cities'), value: String(model.summary.destinations) },
    { label: t('totalNights'), value: String(model.summary.nights) },
  ];
  page.rect(box.x, box.y, box.width, box.height, {
    fill: '#ffffff', stroke: LIGHT_BORDER, lineWidth: 0.7, radius: 7,
  });
  const cellWidth = box.width / metrics.length;
  metrics.forEach((metric, index) => {
    const cellX = box.x + (cellWidth * index);
    if (index) {
      page.line(cellX, box.y + 10, cellX, box.y + box.height - 10, {
        stroke: '#e1e6e8', lineWidth: 0.55,
      });
    }
    page.text(String(metric.label || '').toUpperCase(), cellX + (cellWidth / 2), box.y + 10, {
      size: 6.2, bold: true, color: '#7a868d', align: 'center', maxWidth: cellWidth - 10,
    });
    page.text(metric.value, cellX + (cellWidth / 2), box.y + 28, {
      size: 9.4, bold: true, color: '#354047', align: 'center', maxWidth: cellWidth - 12,
    });
  });
}

function overviewPage(model, countries, intlLocale, t) {
  const page = new VectorPdfPage();
  page.rect(0, 0, PAGE.width, PAGE.height, { fill: '#f8fafb' });
  page.text(model.name || t('unnamedTrip'), 22, 15, {
    size: 18, bold: true, color: '#243238', maxWidth: 470,
  });

  const top = 40;
  const left = { x: 22, y: top, width: 244, height: PAGE.height - top - 22 };
  const rightX = 280;
  const rightWidth = PAGE.width - rightX - 22;
  const metricsHeight = 57;
  const gap = 10;
  const map = {
    x: rightX,
    y: top,
    width: rightWidth,
    height: left.height - metricsHeight - gap,
  };
  const metrics = {
    x: rightX,
    y: map.y + map.height + gap,
    width: rightWidth,
    height: metricsHeight,
  };

  drawRouteList(page, model, intlLocale, t, left);
  drawVectorMap(page, model, countries, map);
  drawMetrics(page, model, intlLocale, t, metrics);
  return page;
}

function noteItems(model) {
  return [
    ...(model.hasOrigin ? [{ ...model.origin, isOrigin: true }] : []),
    ...model.stops.map((stop) => ({ ...stop, isOrigin: false })),
  ];
}

function noteCardLayout(item, width, intlLocale) {
  const bodySize = 8.35;
  const lineHeight = 11.2;
  const titleSize = 10.7;
  const dateSize = 7.9;
  const titleXOffset = 43;
  const rightInset = 9;
  const cityText = String(item.name || '');
  const dateText = item.isOrigin
    ? formatDate(item.departureDate, intlLocale)
    : formatDateRange(item.startDate, item.endDate, intlLocale);
  const availableTitleWidth = width - titleXOffset - rightInset;
  const cityWidth = measurePdfText(cityText, titleSize, true);
  const dateWidth = measurePdfText(dateText || '—', dateSize, true);
  const inlineDate = Boolean(dateText) && (cityWidth + 7 + dateWidth <= availableTitleWidth);
  const separatorOffset = inlineDate ? 31 : 44;
  const bodyOffset = separatorOffset + 10;
  const lines = wrapPdfText(item.note || '—', width - 20, bodySize, false);

  return {
    lines,
    dateText,
    bodySize,
    lineHeight,
    titleSize,
    dateSize,
    titleXOffset,
    cityWidth,
    inlineDate,
    separatorOffset,
    bodyOffset,
    height: Math.max(inlineDate ? 74 : 87, bodyOffset + (lines.length * lineHeight) + 9),
  };
}

function drawNoteCard(page, item, layout, box, t) {
  page.rect(box.x, box.y, box.width, box.height, {
    fill: '#ffffff', stroke: LIGHT_BORDER, lineWidth: 0.7, radius: 6,
  });
  const markerX = box.x + 12;
  const markerY = box.y + 15;
  if (item.isOrigin) {
    page.circle(markerX, markerY, 5.3, { fill: '#ffffff', stroke: '#7b878e', lineWidth: 1.1 });
  } else {
    page.circle(markerX, markerY, 6.3, { fill: item.color || '#63727a' });
    page.text(String(item.number ?? ''), markerX, markerY - 3.4, {
      size: Number(item.number) >= 10 ? 5 : 5.6,
      bold: true,
      color: '#ffffff',
      align: 'center',
    });
  }

  drawCountryFlag(page, item.countryCode, box.x + 22, box.y + 10.4, 14, 9.4);
  const titleX = box.x + layout.titleXOffset;
  const titleY = box.y + 7.6;
  page.text(item.name || t('city'), titleX, titleY, {
    size: layout.titleSize,
    bold: true,
    color: '#3c484f',
    maxWidth: box.width - layout.titleXOffset - 9,
  });

  if (layout.inlineDate) {
    page.text(layout.dateText, titleX + layout.cityWidth + 7, titleY + 1.7, {
      size: layout.dateSize,
      bold: true,
      color: '#5b6870',
      maxWidth: box.x + box.width - 9 - (titleX + layout.cityWidth + 7),
    });
  } else {
    page.text(layout.dateText || '—', titleX, box.y + 23.5, {
      size: layout.dateSize,
      bold: true,
      color: '#5b6870',
      maxWidth: box.width - layout.titleXOffset - 9,
    });
  }

  page.line(
    box.x + 10,
    box.y + layout.separatorOffset,
    box.x + box.width - 10,
    box.y + layout.separatorOffset,
    { stroke: '#e3e7e9', lineWidth: 0.55 }
  );

  let y = box.y + layout.bodyOffset;
  layout.lines.forEach((line) => {
    page.text(line || ' ', box.x + 10, y, {
      size: layout.bodySize,
      color: '#445159',
      maxWidth: box.width - 20,
    });
    y += layout.lineHeight;
  });
}

function notesPages(model, intlLocale, t) {
  const items = noteItems(model);
  if (!items.length) return [];
  const marginX = 22;
  const gap = 9;
  const columns = 4;
  const cardWidth = (PAGE.width - (marginX * 2) - (gap * (columns - 1))) / columns;
  const top = 55;
  const bottom = 22;
  const usableBottom = PAGE.height - bottom;
  const pages = [];
  let page = null;
  let y = top;

  const newPage = () => {
    page = new VectorPdfPage();
    page.rect(0, 0, PAGE.width, PAGE.height, { fill: '#f8fafb' });
    page.text(t('notes'), marginX, 16, { size: 17, bold: true, color: '#27343a' });
    page.text(model.name || t('unnamedTrip'), marginX, 37, {
      size: 7.8, bold: true, color: '#748087', maxWidth: 420,
    });
    pages.push(page);
    y = top;
  };

  newPage();
  for (let rowStart = 0; rowStart < items.length; rowStart += columns) {
    const rowItems = items.slice(rowStart, rowStart + columns);
    const layouts = rowItems.map((item) => noteCardLayout(item, cardWidth, intlLocale));
    const rowHeight = Math.max(...layouts.map((layout) => layout.height));
    if (y > top && y + rowHeight > usableBottom) newPage();

    rowItems.forEach((item, index) => {
      const x = marginX + (index * (cardWidth + gap));
      drawNoteCard(page, item, layouts[index], {
        x, y, width: cardWidth, height: rowHeight,
      }, t);
    });
    y += rowHeight + gap;
  }
  return pages;
}

export async function renderItineraryVectorPdf({ model, intlLocale, t }) {
  const countries = await loadWorldAtlasCountries();
  const pages = [
    overviewPage(model, countries, intlLocale, t),
    ...notesPages(model, intlLocale, t),
  ];
  return buildVectorPdf(pages);
}
