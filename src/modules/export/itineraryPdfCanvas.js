import { colorForIndex } from '../../config.js';
import { formatMoney } from '../../shared/utils.js';

export const ITINERARY_PDF_PAGE = Object.freeze({ width: 1600, height: 1131 });

function createCanvas() {
  const documentRef = globalThis.document;
  if (!documentRef?.createElement) throw new Error('Canvas unavailable');
  const canvas = documentRef.createElement('canvas');
  canvas.width = ITINERARY_PDF_PAGE.width;
  canvas.height = ITINERARY_PDF_PAGE.height;
  return canvas;
}

function canvasPage(canvas) {
  return {
    dataUrl: canvas.toDataURL('image/jpeg', 0.94),
    width: canvas.width,
    height: canvas.height,
  };
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
    image.onerror = () => reject(new Error('Image load failed'));
    image.src = src;
  });
}

function formatDate(iso, locale) {
  if (!iso) return '';
  const date = new Date(`${iso}T00:00:00Z`);
  if (Number.isNaN(date.getTime())) return iso;
  try {
    return new Intl.DateTimeFormat(locale, {
      day: 'numeric',
      month: 'short',
      timeZone: 'UTC',
    }).format(date).replace(/\./g, '');
  } catch {
    return iso;
  }
}

function formatDateRange(startDate, endDate, locale, emptyLabel = '') {
  const start = formatDate(startDate, locale);
  const end = formatDate(endDate, locale);
  if (start && end && start !== end) return `${start} – ${end}`;
  return start || end || emptyLabel;
}

function stopDateLines(stop, locale) {
  const start = formatDate(stop.startDate, locale);
  const end = formatDate(stop.endDate, locale);
  if (start && end && start !== end) return [start, end];
  return [start || end].filter(Boolean);
}

function roundRect(ctx, x, y, width, height, radius) {
  const safeRadius = Math.min(radius, width / 2, height / 2);
  ctx.beginPath();
  ctx.moveTo(x + safeRadius, y);
  ctx.arcTo(x + width, y, x + width, y + height, safeRadius);
  ctx.arcTo(x + width, y + height, x, y + height, safeRadius);
  ctx.arcTo(x, y + height, x, y, safeRadius);
  ctx.arcTo(x, y, x + width, y, safeRadius);
  ctx.closePath();
}

function drawTextEllipsis(ctx, text, x, y, maxWidth) {
  const value = String(text || '');
  if (ctx.measureText(value).width <= maxWidth) {
    ctx.fillText(value, x, y);
    return;
  }
  let clipped = value;
  while (clipped.length > 1 && ctx.measureText(`${clipped}…`).width > maxWidth) {
    clipped = clipped.slice(0, -1);
  }
  ctx.fillText(`${clipped}…`, x, y);
}

function wrapText(ctx, text, maxWidth) {
  const paragraphs = String(text || '').replace(/\r/g, '').split('\n');
  const lines = [];
  paragraphs.forEach((paragraph, paragraphIndex) => {
    const words = paragraph.trim().split(/\s+/).filter(Boolean);
    if (!words.length) {
      lines.push('');
    } else {
      let line = words[0];
      for (const word of words.slice(1)) {
        const candidate = `${line} ${word}`;
        if (ctx.measureText(candidate).width <= maxWidth) line = candidate;
        else {
          lines.push(line);
          line = word;
        }
      }
      lines.push(line);
    }
    if (paragraphIndex < paragraphs.length - 1 && paragraph.trim()) lines.push('');
  });
  return lines;
}

function drawNumber(ctx, number, x, y, diameter = 28, explicitColor = '') {
  const color = explicitColor || colorForIndex(Math.max(0, (Number(number) || 1) - 1));
  ctx.save();
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.arc(x + (diameter / 2), y + (diameter / 2), diameter / 2, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = '#ffffff';
  ctx.lineWidth = 2;
  ctx.stroke();
  ctx.fillStyle = '#ffffff';
  ctx.font = '800 13px Arial, sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(String(number), x + (diameter / 2), y + (diameter / 2) + 0.5);
  ctx.restore();
}

function drawOriginMark(ctx, x, y, diameter = 20) {
  ctx.save();
  ctx.fillStyle = '#ffffff';
  ctx.strokeStyle = '#7d8790';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.arc(x + (diameter / 2), y + (diameter / 2), (diameter / 2) - 1, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();
  ctx.restore();
}

function drawCountryFlag(ctx, code, x, y, width = 26, height = 18) {
  const normalized = String(code || '').trim().toUpperCase();
  ctx.save();
  roundRect(ctx, x, y, width, height, 2.5);
  ctx.clip();
  switch (normalized) {
    case 'FR': {
      const stripe = width / 3;
      ctx.fillStyle = '#2952a3'; ctx.fillRect(x, y, stripe, height);
      ctx.fillStyle = '#ffffff'; ctx.fillRect(x + stripe, y, stripe, height);
      ctx.fillStyle = '#e14b52'; ctx.fillRect(x + (stripe * 2), y, stripe, height);
      break;
    }
    case 'BE': {
      const stripe = width / 3;
      ctx.fillStyle = '#151515'; ctx.fillRect(x, y, stripe, height);
      ctx.fillStyle = '#f2cf19'; ctx.fillRect(x + stripe, y, stripe, height);
      ctx.fillStyle = '#db3d3d'; ctx.fillRect(x + (stripe * 2), y, stripe, height);
      break;
    }
    case 'NL': {
      const stripe = height / 3;
      ctx.fillStyle = '#bf4d57'; ctx.fillRect(x, y, width, stripe);
      ctx.fillStyle = '#ffffff'; ctx.fillRect(x, y + stripe, width, stripe);
      ctx.fillStyle = '#2f57a7'; ctx.fillRect(x, y + (stripe * 2), width, stripe);
      break;
    }
    case 'DE': {
      const stripe = height / 3;
      ctx.fillStyle = '#0f0f10'; ctx.fillRect(x, y, width, stripe);
      ctx.fillStyle = '#c73f3f'; ctx.fillRect(x, y + stripe, width, stripe);
      ctx.fillStyle = '#e0ba34'; ctx.fillRect(x, y + (stripe * 2), width, stripe);
      break;
    }
    case 'ES': {
      const thin = Math.round(height * 0.25);
      const middle = height - (thin * 2);
      ctx.fillStyle = '#c73f3f'; ctx.fillRect(x, y, width, thin);
      ctx.fillStyle = '#e0ba34'; ctx.fillRect(x, y + thin, width, middle);
      ctx.fillStyle = '#c73f3f'; ctx.fillRect(x, y + thin + middle, width, thin);
      break;
    }
    default: {
      ctx.fillStyle = '#f3f5f6';
      ctx.fillRect(x, y, width, height);
      ctx.fillStyle = '#49555d';
      ctx.font = '700 9px Arial, sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(normalized || '·', x + (width / 2), y + (height / 2) + 0.5);
    }
  }
  ctx.restore();
}

function drawRouteList(ctx, model, intlLocale, t, box) {
  const { x, y, width, height } = box;
  const entries = [
    ...(model.hasOrigin ? [{ ...model.origin, isOrigin: true }] : []),
    ...model.stops,
  ];
  const titleHeight = 54;
  const rowAreaHeight = height - titleHeight - 12;
  const rowHeight = Math.max(34, Math.min(46, rowAreaHeight / Math.max(entries.length, 1)));

  ctx.save();
  roundRect(ctx, x, y, width, height, 18);
  ctx.fillStyle = '#ffffff';
  ctx.fill();
  ctx.strokeStyle = '#dfe5e8';
  ctx.lineWidth = 1;
  ctx.stroke();

  ctx.fillStyle = '#2f3940';
  ctx.font = '700 19px Arial, sans-serif';
  ctx.textBaseline = 'middle';
  ctx.fillText(t('itinerary'), x + 22, y + 28);

  entries.forEach((entry, index) => {
    const rowY = y + titleHeight + (index * rowHeight);
    const centerY = rowY + (rowHeight / 2);
    const numberX = x + 18;
    const flagX = x + 60;
    const cityX = x + 96;
    const dateX = x + width - 154;
    const costX = x + width - 16;

    if (index > 0) {
      ctx.strokeStyle = '#d4dade';
      ctx.setLineDash([3, 5]);
      ctx.beginPath();
      ctx.moveTo(x + 18, rowY);
      ctx.lineTo(x + width - 18, rowY);
      ctx.stroke();
      ctx.setLineDash([]);
    }

    if (entry.isOrigin) drawOriginMark(ctx, numberX + 4, centerY - 10, 20);
    else if (entry.number != null) drawNumber(ctx, entry.number, numberX, centerY - 14, 28, entry.color);
    else drawOriginMark(ctx, numberX + 4, centerY - 10, 20);

    if (entry.countryCode) {
      drawCountryFlag(ctx, entry.countryCode, flagX, centerY - 9, 24, 16);
    }

    ctx.font = '700 15px Arial, sans-serif';
    ctx.fillStyle = '#323c43';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    drawTextEllipsis(ctx, entry.name || t('city'), cityX, centerY, Math.max(80, dateX - cityX - 18));

    const dateLines = entry.isOrigin
      ? [formatDate(entry.departureDate, intlLocale)].filter(Boolean)
      : stopDateLines(entry, intlLocale);
    ctx.fillStyle = '#52616a';
    ctx.font = '700 12px Arial, sans-serif';
    ctx.textAlign = 'left';
    if (dateLines.length > 1) {
      ctx.fillText(dateLines[0], dateX, centerY - 7);
      ctx.fillText(dateLines[1], dateX, centerY + 8);
    } else if (dateLines[0]) {
      ctx.fillText(dateLines[0], dateX, centerY + 1);
    }

    ctx.fillStyle = '#3f484e';
    ctx.font = '700 12px Arial, sans-serif';
    ctx.textAlign = 'right';
    ctx.fillText(formatMoney(entry.total || 0, model.currency, intlLocale), costX, centerY + 1);
  });
  ctx.restore();
}

function drawImageContain(ctx, image, x, y, width, height) {
  const ratio = Math.min(width / image.width, height / image.height);
  const drawWidth = image.width * ratio;
  const drawHeight = image.height * ratio;
  const drawX = x + ((width - drawWidth) / 2);
  const drawY = y + ((height - drawHeight) / 2);
  ctx.drawImage(image, drawX, drawY, drawWidth, drawHeight);
}

function drawMetrics(ctx, model, intlLocale, t, box) {
  const { x, y, width, height } = box;
  const metrics = [
    { label: t('tripDates'), value: formatDateRange(model.summary.startDate, model.summary.endDate, intlLocale, t('noTripDates')) },
    { label: t('grandTotal'), value: formatMoney(model.total, model.currency, intlLocale) },
    { label: t(model.summary.countries === 1 ? 'country' : 'countries'), value: String(model.summary.countries) },
    { label: t('cities'), value: String(model.summary.destinations) },
    { label: t('totalNights'), value: String(model.summary.nights) },
  ];

  ctx.save();
  roundRect(ctx, x, y, width, height, 14);
  ctx.fillStyle = '#ffffff';
  ctx.fill();
  ctx.strokeStyle = '#dfe5e8';
  ctx.lineWidth = 1;
  ctx.stroke();

  const cellWidth = width / metrics.length;
  metrics.forEach((metric, index) => {
    const cellX = x + (cellWidth * index);
    if (index > 0) {
      ctx.strokeStyle = '#e1e6e9';
      ctx.beginPath();
      ctx.moveTo(cellX, y + 15);
      ctx.lineTo(cellX, y + height - 15);
      ctx.stroke();
    }
    ctx.fillStyle = '#7c878e';
    ctx.font = '700 10px Arial, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(String(metric.label || '').toUpperCase(), cellX + (cellWidth / 2), y + 24);
    ctx.fillStyle = '#354047';
    ctx.font = '700 16px Arial, sans-serif';
    drawTextEllipsis(ctx, metric.value, cellX + (cellWidth / 2), y + 50, cellWidth - 24);
  });
  ctx.restore();
}

async function renderOverviewPage({ model, mapSnapshot, intlLocale, t }) {
  const canvas = createCanvas();
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#f7f9fa';
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  const margin = 44;
  const top = 34;
  const titleHeight = 44;
  ctx.fillStyle = '#1f2c32';
  ctx.font = '800 28px Arial, sans-serif';
  ctx.textAlign = 'left';
  ctx.textBaseline = 'middle';
  drawTextEllipsis(ctx, model.name || t('unnamedTrip'), margin, top + 22, 760);

  const contentY = top + titleHeight;
  const contentHeight = canvas.height - contentY - margin;
  const leftWidth = 438;
  const gap = 22;
  const rightX = margin + leftWidth + gap;
  const rightWidth = canvas.width - rightX - margin;
  const metricsHeight = 82;
  const mapHeight = contentHeight - metricsHeight - 14;

  drawRouteList(ctx, model, intlLocale, t, {
    x: margin,
    y: contentY,
    width: leftWidth,
    height: contentHeight,
  });

  roundRect(ctx, rightX, contentY, rightWidth, mapHeight, 18);
  ctx.save();
  ctx.clip();
  ctx.fillStyle = '#eaf3f6';
  ctx.fillRect(rightX, contentY, rightWidth, mapHeight);
  const mapImage = await loadImage(mapSnapshot.dataUrl);
  drawImageContain(ctx, mapImage, rightX, contentY, rightWidth, mapHeight);
  ctx.restore();
  ctx.strokeStyle = '#d8e0e4';
  ctx.lineWidth = 1;
  roundRect(ctx, rightX, contentY, rightWidth, mapHeight, 18);
  ctx.stroke();

  drawMetrics(ctx, model, intlLocale, t, {
    x: rightX,
    y: contentY + mapHeight + 14,
    width: rightWidth,
    height: metricsHeight,
  });

  return canvasPage(canvas);
}

function cardHeight(ctx, item, width) {
  ctx.font = '400 14px Arial, sans-serif';
  const noteLines = wrapText(ctx, item.note || '—', width - 34);
  return Math.max(126, 90 + (Math.min(noteLines.length, 13) * 19));
}

function drawNoteCard(ctx, item, intlLocale, t, box) {
  const { x, y, width, height } = box;
  ctx.save();
  roundRect(ctx, x, y, width, height, 12);
  ctx.fillStyle = item.isOrigin ? '#f7fbfc' : '#ffffff';
  ctx.fill();
  ctx.strokeStyle = item.isOrigin ? '#c8dade' : '#dfe5e8';
  ctx.lineWidth = 1;
  ctx.stroke();

  const markerY = y + 18;
  const numberX = x + 14;
  if (item.isOrigin) drawOriginMark(ctx, numberX + 4, markerY + 1, 20);
  else if (item.number != null) drawNumber(ctx, item.number, numberX, markerY - 2, 28, item.color);
  else drawOriginMark(ctx, numberX + 4, markerY + 1, 20);

  const flagX = x + 50;
  const titleX = x + 82;
  const headerRight = x + width - 16;
  if (item.countryCode) drawCountryFlag(ctx, item.countryCode, flagX, markerY + 3, 24, 16);

  const cityName = item.name || t('city');
  const dateText = item.isOrigin
    ? formatDate(item.departureDate, intlLocale)
    : formatDateRange(item.startDate, item.endDate, intlLocale);

  ctx.textAlign = 'left';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = '#46525a';
  ctx.font = '800 18px Arial, sans-serif';
  const cityWidth = ctx.measureText(cityName).width;
  ctx.font = '700 15px Arial, sans-serif';
  const dateWidth = ctx.measureText(dateText || '').width;
  const availableInline = headerRight - titleX;
  const inlineHeader = Boolean(dateText) && (cityWidth + 12 + dateWidth) <= availableInline;

  ctx.fillStyle = '#46525a';
  ctx.font = '800 18px Arial, sans-serif';
  if (inlineHeader) {
    drawTextEllipsis(ctx, cityName, titleX, y + 28, Math.max(60, availableInline - dateWidth - 14));
    ctx.fillStyle = '#5d6970';
    ctx.font = '700 15px Arial, sans-serif';
    ctx.textAlign = 'right';
    ctx.fillText(dateText, headerRight, y + 28);
  } else {
    drawTextEllipsis(ctx, cityName, titleX, y + 24, availableInline);
    ctx.fillStyle = '#5d6970';
    ctx.font = '700 15px Arial, sans-serif';
    ctx.textAlign = 'left';
    ctx.fillText(dateText || '—', titleX, y + 47);
  }

  const dividerY = inlineHeader ? y + 56 : y + 68;
  ctx.strokeStyle = '#e6eaec';
  ctx.beginPath();
  ctx.moveTo(x + 16, dividerY);
  ctx.lineTo(x + width - 16, dividerY);
  ctx.stroke();

  ctx.fillStyle = item.note ? '#505c63' : '#8a959b';
  ctx.font = item.note ? '400 14px Arial, sans-serif' : 'italic 400 14px Arial, sans-serif';
  const lines = wrapText(ctx, item.note || '—', width - 34).slice(0, 13);
  let lineY = dividerY + 20;
  lines.forEach((line) => {
    ctx.textAlign = 'left';
    ctx.textBaseline = 'alphabetic';
    ctx.fillText(line, x + 17, lineY);
    lineY += 19;
  });
  ctx.restore();
}

function notesItems(model) {
  return [
    ...(model.hasOrigin ? [{ ...model.origin, isOrigin: true }] : []),
    ...model.stops,
  ];
}

function renderNotesPages({ model, intlLocale, t }) {
  const items = notesItems(model);
  if (!items.length) return [];
  const pages = [];
  const margin = 44;
  const gap = 16;
  const columns = 4;
  const cardWidth = (ITINERARY_PDF_PAGE.width - (margin * 2) - (gap * (columns - 1))) / columns;
  const contentTop = 96;
  const contentBottom = ITINERARY_PDF_PAGE.height - 44;
  const measureCanvas = createCanvas();
  const measureCtx = measureCanvas.getContext('2d');

  let itemIndex = 0;
  while (itemIndex < items.length) {
    const canvas = createCanvas();
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = '#f7f9fa';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = '#26343b';
    ctx.font = '800 26px Arial, sans-serif';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    ctx.fillText(t('notes'), margin, 44);
    ctx.fillStyle = '#66737b';
    ctx.font = '700 13px Arial, sans-serif';
    drawTextEllipsis(ctx, model.name || t('unnamedTrip'), margin, 72, 700);

    let rowY = contentTop;
    while (itemIndex < items.length) {
      const rowItems = items.slice(itemIndex, itemIndex + columns);
      const rowHeight = Math.max(...rowItems.map((item) => cardHeight(measureCtx, item, cardWidth)));
      if (rowY + rowHeight > contentBottom && rowY > contentTop) break;

      rowItems.forEach((item, columnIndex) => {
        drawNoteCard(ctx, item, intlLocale, t, {
          x: margin + (columnIndex * (cardWidth + gap)),
          y: rowY,
          width: cardWidth,
          height: rowHeight,
        });
      });
      itemIndex += rowItems.length;
      rowY += rowHeight + gap;
    }
    pages.push(canvasPage(canvas));
  }
  return pages;
}

export async function renderItineraryPdfPages({ model, mapSnapshot, intlLocale, t }) {
  if (!mapSnapshot?.dataUrl) throw new Error('Map snapshot unavailable');
  const overview = await renderOverviewPage({ model, mapSnapshot, intlLocale, t });
  return [overview, ...renderNotesPages({ model, intlLocale, t })];
}
