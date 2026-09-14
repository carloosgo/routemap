import { formatMoney } from '../../shared/utils.js';
import { drawCountryFlag } from './countryFlagVector.js';
import { addJpegImage, buildHybridPdf } from './pdfHybridDocument.js';
import {
  PDF_A4_LANDSCAPE,
  VectorPdfPage,
  measurePdfText,
  wrapPdfText,
} from './pdfVectorDocument.js';

const PAGE = PDF_A4_LANDSCAPE;
const TEXT = '#2f3b42';
const MUTED = '#68757d';
const LIGHT_BORDER = '#dce2e5';

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
  const flagX = box.x + 27;
  const cityX = box.x + 45;
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
      page.circle(markerX, centerY, 6.1, { fill: entry.color || '#63727a' });
      page.text(String(entry.number ?? ''), markerX, centerY - 3.5, {
        size: Number(entry.number) >= 10 ? 5.4 : 6.0,
        bold: true,
        color: '#ffffff',
        align: 'center',
      });
    }

    drawCountryFlag(page, entry.countryCode, flagX, centerY - 4.75, 14.2, 9.5);
    page.text(entry.name || t('city'), cityX, centerY - 4.25, {
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

function overviewPage(model, mapImage, intlLocale, t) {
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
  page.rect(map.x, map.y, map.width, map.height, {
    fill: '#eaf3f6', stroke: '#d4dfe2', lineWidth: 0.7, radius: 8,
  });
  addJpegImage(page, mapImage, map, 'ItineraryMap', { fit: 'contain' });
  page.rect(map.x, map.y, map.width, map.height, {
    stroke: '#d4dfe2', lineWidth: 0.7, radius: 8,
  });
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
  const titleXOffset = 46.5;
  const rightInset = 9;
  const cityText = String(item.name || '');
  const dateText = item.isOrigin
    ? formatDate(item.departureDate, intlLocale)
    : formatDateRange(item.startDate, item.endDate, intlLocale);
  const availableTitleWidth = width - titleXOffset - rightInset;
  const cityWidth = measurePdfText(cityText, titleSize, true);
  const dateWidth = measurePdfText(dateText || '—', dateSize, true);
  const inlineDate = Boolean(dateText) && (cityWidth + 7 + dateWidth <= availableTitleWidth);
  const separatorOffset = inlineDate ? 34 : 48;
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
    height: Math.max(inlineDate ? 75 : 88, bodyOffset + (lines.length * lineHeight) + 9),
  };
}

function drawNoteCard(page, item, layout, box, t) {
  page.rect(box.x, box.y, box.width, box.height, {
    fill: '#ffffff', stroke: LIGHT_BORDER, lineWidth: 0.7, radius: 6,
  });
  const headerCenterY = box.y + 17;
  const markerX = box.x + 12;
  if (item.isOrigin) {
    page.circle(markerX, headerCenterY, 5.3, { fill: '#ffffff', stroke: '#7b878e', lineWidth: 1.1 });
  } else {
    page.circle(markerX, headerCenterY, 7.2, { fill: item.color || '#63727a' });
    page.text(String(item.number ?? ''), markerX, headerCenterY - 3.7, {
      size: Number(item.number) >= 10 ? 5.9 : 6.6,
      bold: true,
      color: '#ffffff',
      align: 'center',
    });
  }

  drawCountryFlag(page, item.countryCode, box.x + 25, headerCenterY - 5.2, 15.5, 10.4);
  const titleX = box.x + layout.titleXOffset;
  const titleY = headerCenterY - (layout.titleSize * 0.46);
  const inlineDateY = headerCenterY - (layout.dateSize * 0.46);
  page.text(item.name || t('city'), titleX, titleY, {
    size: layout.titleSize,
    bold: true,
    color: '#3c484f',
    maxWidth: box.width - layout.titleXOffset - 9,
  });

  if (layout.inlineDate) {
    page.text(layout.dateText, titleX + layout.cityWidth + 7, inlineDateY, {
      size: layout.dateSize,
      bold: true,
      color: '#5b6870',
      maxWidth: box.x + box.width - 9 - (titleX + layout.cityWidth + 7),
    });
  } else {
    page.text(layout.dateText || '—', titleX, box.y + 28.4, {
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

export function renderItineraryHybridPdf({ model, mapImage, intlLocale, t }) {
  if (!mapImage?.bytes?.length) throw new Error('Itinerary map image is required');
  const pages = [
    overviewPage(model, mapImage, intlLocale, t),
    ...notesPages(model, intlLocale, t),
  ];
  return buildHybridPdf(pages);
}
