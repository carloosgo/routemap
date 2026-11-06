const HORIZONTAL_FLAGS = Object.freeze({
  AT: ['#ED2939', '#FFFFFF', '#ED2939'],
  BG: ['#FFFFFF', '#00966E', '#D62612'],
  DE: ['#000000', '#DD0000', '#FFCE00'],
  EE: ['#4891D9', '#000000', '#FFFFFF'],
  HU: ['#CE2939', '#FFFFFF', '#477050'],
  LT: ['#FDB913', '#006A44', '#C1272D'],
  LU: ['#ED2939', '#FFFFFF', '#00A1DE'],
  NL: ['#AE1C28', '#FFFFFF', '#21468B'],
  RU: ['#FFFFFF', '#0039A6', '#D52B1E'],
});

const VERTICAL_FLAGS = Object.freeze({
  BE: ['#111111', '#FDDA24', '#EF3340'],
  CI: ['#F77F00', '#FFFFFF', '#009E60'],
  FR: ['#0055A4', '#FFFFFF', '#EF4135'],
  IE: ['#169B62', '#FFFFFF', '#FF883E'],
  IT: ['#009246', '#FFFFFF', '#CE2B37'],
  MX: ['#006847', '#FFFFFF', '#CE1126'],
  RO: ['#002B7F', '#FCD116', '#CE1126'],
});

const BICOLOR_HORIZONTAL_FLAGS = Object.freeze({
  ID: ['#FF0000', '#FFFFFF'],
  MC: ['#CE1126', '#FFFFFF'],
  PL: ['#FFFFFF', '#DC143C'],
  UA: ['#0057B7', '#FFD700'],
});

function normalizeCode(code) {
  return String(code || '').trim().toUpperCase();
}

function flagSurface(page, x, y, width, height, draw) {
  page.rect(x, y, width, height, { fill: '#FFFFFF' });
  draw();
}

function horizontalBands(page, colors, x, y, width, height, weights = null) {
  const normalizedWeights = Array.isArray(weights) && weights.length === colors.length
    ? weights
    : colors.map(() => 1);
  const total = normalizedWeights.reduce((sum, value) => sum + value, 0) || colors.length;
  let cursor = y;
  colors.forEach((color, index) => {
    const bandHeight = index === colors.length - 1
      ? (y + height) - cursor
      : height * (normalizedWeights[index] / total);
    page.rect(x, cursor, width, bandHeight, { fill: color });
    cursor += bandHeight;
  });
}

function verticalBands(page, colors, x, y, width, height, weights = null) {
  const normalizedWeights = Array.isArray(weights) && weights.length === colors.length
    ? weights
    : colors.map(() => 1);
  const total = normalizedWeights.reduce((sum, value) => sum + value, 0) || colors.length;
  let cursor = x;
  colors.forEach((color, index) => {
    const bandWidth = index === colors.length - 1
      ? (x + width) - cursor
      : width * (normalizedWeights[index] / total);
    page.rect(cursor, y, bandWidth, height, { fill: color });
    cursor += bandWidth;
  });
}

function nordicCross(page, code, x, y, width, height) {
  const palette = {
    DK: { base: '#C60C30', outer: '#FFFFFF' },
    FI: { base: '#FFFFFF', outer: '#003580' },
    IS: { base: '#02529C', outer: '#FFFFFF', inner: '#DC1E35' },
    NO: { base: '#BA0C2F', outer: '#FFFFFF', inner: '#00205B' },
    SE: { base: '#006AA7', outer: '#FECC00' },
  }[code];
  if (!palette) return false;

  page.rect(x, y, width, height, { fill: palette.base });
  const verticalX = x + (width * 0.31);
  const horizontalY = y + (height * 0.42);
  const outerVertical = width * 0.14;
  const outerHorizontal = height * 0.18;
  page.rect(verticalX, y, outerVertical, height, { fill: palette.outer });
  page.rect(x, horizontalY, width, outerHorizontal, { fill: palette.outer });

  if (palette.inner) {
    const innerVertical = outerVertical * 0.48;
    const innerHorizontal = outerHorizontal * 0.48;
    page.rect(
      verticalX + ((outerVertical - innerVertical) / 2),
      y,
      innerVertical,
      height,
      { fill: palette.inner }
    );
    page.rect(
      x,
      horizontalY + ((outerHorizontal - innerHorizontal) / 2),
      width,
      innerHorizontal,
      { fill: palette.inner }
    );
  }
  return true;
}

function specialFlag(page, code, x, y, width, height) {
  if (code === 'ES') {
    horizontalBands(page, ['#AA151B', '#F1BF00', '#AA151B'], x, y, width, height, [1, 2, 1]);
    return true;
  }
  if (code === 'PT') {
    verticalBands(page, ['#046A38', '#DA291C'], x, y, width, height, [2, 3]);
    return true;
  }
  if (code === 'JP') {
    page.rect(x, y, width, height, { fill: '#FFFFFF' });
    page.circle(x + (width / 2), y + (height / 2), Math.min(width, height) * 0.24, { fill: '#BC002D' });
    return true;
  }
  if (code === 'CH') {
    page.rect(x, y, width, height, { fill: '#FF0000' });
    const arm = Math.min(width, height) * 0.18;
    const span = Math.min(width, height) * 0.62;
    page.rect(x + ((width - arm) / 2), y + ((height - span) / 2), arm, span, { fill: '#FFFFFF' });
    page.rect(x + ((width - span) / 2), y + ((height - arm) / 2), span, arm, { fill: '#FFFFFF' });
    return true;
  }
  return nordicCross(page, code, x, y, width, height);
}

export function drawCountryFlag(page, code, x, y, width = 14, height = 9) {
  const normalized = normalizeCode(code);
  if (!normalized) return false;

  flagSurface(page, x, y, width, height, () => {
    if (VERTICAL_FLAGS[normalized]) {
      verticalBands(page, VERTICAL_FLAGS[normalized], x, y, width, height);
      return;
    }
    if (HORIZONTAL_FLAGS[normalized]) {
      horizontalBands(page, HORIZONTAL_FLAGS[normalized], x, y, width, height);
      return;
    }
    if (BICOLOR_HORIZONTAL_FLAGS[normalized]) {
      horizontalBands(page, BICOLOR_HORIZONTAL_FLAGS[normalized], x, y, width, height);
      return;
    }
    if (specialFlag(page, normalized, x, y, width, height)) return;

    page.rect(x, y, width, height, { fill: '#F7F9FA' });
    page.text(normalized.slice(0, 2), x + (width / 2), y + ((height - 5.1) / 2), {
      size: 5.1,
      bold: true,
      color: '#53616A',
      align: 'center',
      maxWidth: width - 2,
    });
  });
  return true;
}