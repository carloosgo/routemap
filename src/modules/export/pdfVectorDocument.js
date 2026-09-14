export const PDF_A4_LANDSCAPE = Object.freeze({ width: 841.89, height: 595.28 });

const CP1252 = new Map([
  [0x20ac, 0x80], [0x201a, 0x82], [0x0192, 0x83], [0x201e, 0x84],
  [0x2026, 0x85], [0x2020, 0x86], [0x2021, 0x87], [0x02c6, 0x88],
  [0x2030, 0x89], [0x0160, 0x8a], [0x2039, 0x8b], [0x0152, 0x8c],
  [0x017d, 0x8e], [0x2018, 0x91], [0x2019, 0x92], [0x201c, 0x93],
  [0x201d, 0x94], [0x2022, 0x95], [0x2013, 0x96], [0x2014, 0x97],
  [0x02dc, 0x98], [0x2122, 0x99], [0x0161, 0x9a], [0x203a, 0x9b],
  [0x0153, 0x9c], [0x017e, 0x9e], [0x0178, 0x9f],
]);

function winAnsiBytes(text) {
  const value = String(text ?? '');
  const bytes = [];
  for (const char of value) {
    const codePoint = char.codePointAt(0);
    if (codePoint <= 0x7f || (codePoint >= 0xa0 && codePoint <= 0xff)) {
      bytes.push(codePoint);
    } else if (CP1252.has(codePoint)) {
      bytes.push(CP1252.get(codePoint));
    } else {
      bytes.push(0x3f);
    }
  }
  return Uint8Array.from(bytes);
}

function concatBytes(parts) {
  const total = parts.reduce((sum, part) => sum + part.length, 0);
  const output = new Uint8Array(total);
  let offset = 0;
  parts.forEach((part) => {
    output.set(part, offset);
    offset += part.length;
  });
  return output;
}

function number(value) {
  const rounded = Math.round((Number(value) || 0) * 1000) / 1000;
  return Number.isInteger(rounded) ? String(rounded) : String(rounded).replace(/0+$/, '');
}

function normalizeHex(hex, fallback = '#000000') {
  const match = /^#?([0-9a-f]{6})$/i.exec(String(hex || '').trim());
  return `#${match?.[1] || fallback.replace('#', '')}`.toLowerCase();
}

export function hexToRgb(hex) {
  const value = normalizeHex(hex);
  return {
    r: parseInt(value.slice(1, 3), 16),
    g: parseInt(value.slice(3, 5), 16),
    b: parseInt(value.slice(5, 7), 16),
  };
}

export function mixHex(from, to = '#ffffff', ratio = 0.5) {
  const left = hexToRgb(from);
  const right = hexToRgb(to);
  const amount = Math.max(0, Math.min(1, Number(ratio) || 0));
  const channel = (a, b) => Math.round(a + ((b - a) * amount));
  return `#${[channel(left.r, right.r), channel(left.g, right.g), channel(left.b, right.b)]
    .map((value) => value.toString(16).padStart(2, '0')).join('')}`;
}

function colorCommand(hex, stroke = false) {
  const { r, g, b } = hexToRgb(hex);
  return `${number(r / 255)} ${number(g / 255)} ${number(b / 255)} ${stroke ? 'RG' : 'rg'}`;
}

function escapePdfText(value) {
  return String(value ?? '')
    .replace(/\\/g, '\\\\')
    .replace(/\(/g, '\\(')
    .replace(/\)/g, '\\)')
    .replace(/[\r\n\t]+/g, ' ');
}

function characterWidth(char) {
  if (char === ' ') return 0.28;
  if ('ilI.,:;!|\'`'.includes(char)) return 0.25;
  if ('mwMW@%&#'.includes(char)) return 0.84;
  if ('ABCDEFGHJKLMNOPQRSTUVWXYZ'.includes(char)) return 0.66;
  if ('0123456789'.includes(char)) return 0.56;
  if ('()[]{}<>/\\-+='.includes(char)) return 0.38;
  return 0.52;
}

export function measurePdfText(text, fontSize, bold = false) {
  const weight = bold ? 1.035 : 1;
  return [...String(text ?? '')].reduce((sum, char) => sum + characterWidth(char), 0) * fontSize * weight;
}

export function ellipsizePdfText(text, maxWidth, fontSize, bold = false) {
  const value = String(text ?? '');
  if (measurePdfText(value, fontSize, bold) <= maxWidth) return value;
  const suffix = '…';
  let clipped = value;
  while (clipped.length > 1 && measurePdfText(`${clipped}${suffix}`, fontSize, bold) > maxWidth) {
    clipped = clipped.slice(0, -1);
  }
  return `${clipped}${suffix}`;
}

export function wrapPdfText(text, maxWidth, fontSize, bold = false) {
  const paragraphs = String(text ?? '').replace(/\r/g, '').split('\n');
  const lines = [];
  paragraphs.forEach((paragraph, paragraphIndex) => {
    const words = paragraph.trim().split(/\s+/).filter(Boolean);
    if (!words.length) {
      lines.push('');
    } else {
      let line = '';
      words.forEach((word) => {
        if (!line) {
          if (measurePdfText(word, fontSize, bold) <= maxWidth) {
            line = word;
            return;
          }
          let fragment = '';
          [...word].forEach((char) => {
            const candidate = `${fragment}${char}`;
            if (fragment && measurePdfText(candidate, fontSize, bold) > maxWidth) {
              lines.push(fragment);
              fragment = char;
            } else {
              fragment = candidate;
            }
          });
          line = fragment;
          return;
        }
        const candidate = `${line} ${word}`;
        if (measurePdfText(candidate, fontSize, bold) <= maxWidth) {
          line = candidate;
        } else {
          lines.push(line);
          line = word;
        }
      });
      if (line) lines.push(line);
    }
    if (paragraphIndex < paragraphs.length - 1) lines.push('');
  });
  return lines;
}

function roundedRectPath(x, y, width, height, radius, pageHeight) {
  const r = Math.max(0, Math.min(radius, width / 2, height / 2));
  const k = 0.5522847498;
  const left = x;
  const right = x + width;
  const bottom = pageHeight - y - height;
  const top = bottom + height;
  if (!r) return `${number(left)} ${number(bottom)} ${number(width)} ${number(height)} re`;
  return [
    `${number(left + r)} ${number(bottom)} m`,
    `${number(right - r)} ${number(bottom)} l`,
    `${number(right - r + (r * k))} ${number(bottom)} ${number(right)} ${number(bottom + r - (r * k))} ${number(right)} ${number(bottom + r)} c`,
    `${number(right)} ${number(top - r)} l`,
    `${number(right)} ${number(top - r + (r * k))} ${number(right - r + (r * k))} ${number(top)} ${number(right - r)} ${number(top)} c`,
    `${number(left + r)} ${number(top)} l`,
    `${number(left + r - (r * k))} ${number(top)} ${number(left)} ${number(top - r + (r * k))} ${number(left)} ${number(top - r)} c`,
    `${number(left)} ${number(bottom + r)} l`,
    `${number(left)} ${number(bottom + r - (r * k))} ${number(left + r - (r * k))} ${number(bottom)} ${number(left + r)} ${number(bottom)} c`,
    'h',
  ].join('\n');
}

export class VectorPdfPage {
  constructor({ width = PDF_A4_LANDSCAPE.width, height = PDF_A4_LANDSCAPE.height } = {}) {
    this.width = width;
    this.height = height;
    this.commands = [];
  }

  save() { this.commands.push('q'); }
  restore() { this.commands.push('Q'); }

  clipRect(x, y, width, height) {
    const bottom = this.height - y - height;
    this.commands.push(`${number(x)} ${number(bottom)} ${number(width)} ${number(height)} re W n`);
  }

  rect(x, y, width, height, {
    fill = '', stroke = '', lineWidth = 1, radius = 0,
  } = {}) {
    const path = roundedRectPath(x, y, width, height, radius, this.height);
    if (fill) this.commands.push(colorCommand(fill));
    if (stroke) this.commands.push(colorCommand(stroke, true), `${number(lineWidth)} w`);
    this.commands.push(path, fill && stroke ? 'B' : fill ? 'f' : 'S');
  }

  line(x1, y1, x2, y2, {
    stroke = '#000000', lineWidth = 1, dash = null,
  } = {}) {
    const py1 = this.height - y1;
    const py2 = this.height - y2;
    this.commands.push(colorCommand(stroke, true), `${number(lineWidth)} w`);
    this.commands.push(Array.isArray(dash) && dash.length
      ? `[${dash.map(number).join(' ')}] 0 d`
      : '[] 0 d');
    this.commands.push(`${number(x1)} ${number(py1)} m ${number(x2)} ${number(py2)} l S`);
  }

  polyline(points, options = {}) {
    if (!Array.isArray(points) || points.length < 2) return;
    const { stroke = '#000000', lineWidth = 1, dash = null } = options;
    this.commands.push(colorCommand(stroke, true), `${number(lineWidth)} w`);
    this.commands.push(Array.isArray(dash) && dash.length
      ? `[${dash.map(number).join(' ')}] 0 d`
      : '[] 0 d');
    const [first, ...rest] = points;
    const path = [`${number(first[0])} ${number(this.height - first[1])} m`];
    rest.forEach(([x, y]) => path.push(`${number(x)} ${number(this.height - y)} l`));
    this.commands.push(path.join('\n'), 'S');
  }

  multiPolygon(polygons, {
    fill = '#ffffff', stroke = '#cccccc', lineWidth = 0.5,
  } = {}) {
    if (!Array.isArray(polygons) || !polygons.length) return;
    if (fill) this.commands.push(colorCommand(fill));
    if (stroke) this.commands.push(colorCommand(stroke, true), `${number(lineWidth)} w`);
    const path = [];
    polygons.forEach((polygon) => {
      (Array.isArray(polygon) ? polygon : []).forEach((ring) => {
        if (!Array.isArray(ring) || ring.length < 3) return;
        const [first, ...rest] = ring;
        path.push(`${number(first[0])} ${number(this.height - first[1])} m`);
        rest.forEach(([x, y]) => path.push(`${number(x)} ${number(this.height - y)} l`));
        path.push('h');
      });
    });
    if (!path.length) return;
    this.commands.push(path.join('\n'), fill && stroke ? 'B*' : fill ? 'f*' : 'S');
  }

  circle(cx, cy, radius, {
    fill = '#000000', stroke = '', lineWidth = 1,
  } = {}) {
    const k = 0.5522847498;
    const y = this.height - cy;
    const r = radius;
    if (fill) this.commands.push(colorCommand(fill));
    if (stroke) this.commands.push(colorCommand(stroke, true), `${number(lineWidth)} w`);
    this.commands.push([
      `${number(cx + r)} ${number(y)} m`,
      `${number(cx + r)} ${number(y + (r * k))} ${number(cx + (r * k))} ${number(y + r)} ${number(cx)} ${number(y + r)} c`,
      `${number(cx - (r * k))} ${number(y + r)} ${number(cx - r)} ${number(y + (r * k))} ${number(cx - r)} ${number(y)} c`,
      `${number(cx - r)} ${number(y - (r * k))} ${number(cx - (r * k))} ${number(y - r)} ${number(cx)} ${number(y - r)} c`,
      `${number(cx + (r * k))} ${number(y - r)} ${number(cx + r)} ${number(y - (r * k))} ${number(cx + r)} ${number(y)} c`,
      'h',
      fill && stroke ? 'B' : fill ? 'f' : 'S',
    ].join('\n'));
  }

  text(value, x, y, {
    size = 10,
    bold = false,
    color = '#263238',
    align = 'left',
    maxWidth = null,
  } = {}) {
    let text = String(value ?? '');
    if (maxWidth != null) text = ellipsizePdfText(text, maxWidth, size, bold);
    let drawX = x;
    const width = measurePdfText(text, size, bold);
    if (align === 'center') drawX -= width / 2;
    if (align === 'right') drawX -= width;
    const baseline = this.height - y - (size * 0.82);
    this.commands.push(
      colorCommand(color),
      `BT /${bold ? 'F2' : 'F1'} ${number(size)} Tf 1 0 0 1 ${number(drawX)} ${number(baseline)} Tm (${escapePdfText(text)}) Tj ET`
    );
    return width;
  }

  toBytes() {
    return winAnsiBytes(this.commands.join('\n'));
  }
}

export function buildVectorPdf(pages, {
  width = PDF_A4_LANDSCAPE.width,
  height = PDF_A4_LANDSCAPE.height,
} = {}) {
  if (!Array.isArray(pages) || !pages.length) throw new Error('PDF requires at least one page');

  const objectCount = 4 + (pages.length * 2);
  const objects = new Array(objectCount + 1);
  const pageRefs = [];
  objects[1] = winAnsiBytes('<< /Type /Catalog /Pages 2 0 R >>');
  objects[3] = winAnsiBytes('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>');
  objects[4] = winAnsiBytes('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>');

  pages.forEach((page, index) => {
    const pageObject = 5 + (index * 2);
    const contentObject = pageObject + 1;
    pageRefs.push(`${pageObject} 0 R`);
    const pageWidth = page?.width || width;
    const pageHeight = page?.height || height;
    const content = page?.toBytes ? page.toBytes() : winAnsiBytes(String(page?.content || ''));
    objects[pageObject] = winAnsiBytes(
      `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${number(pageWidth)} ${number(pageHeight)}] /Resources << /Font << /F1 3 0 R /F2 4 0 R >> >> /Contents ${contentObject} 0 R >>`
    );
    objects[contentObject] = concatBytes([
      winAnsiBytes(`<< /Length ${content.length} >>\nstream\n`),
      content,
      winAnsiBytes('\nendstream'),
    ]);
  });

  objects[2] = winAnsiBytes(`<< /Type /Pages /Kids [${pageRefs.join(' ')}] /Count ${pages.length} >>`);

  const header = winAnsiBytes('%PDF-1.4\n%Atlas\n');
  const parts = [header];
  const offsets = new Array(objectCount + 1).fill(0);
  let cursor = header.length;
  for (let objectId = 1; objectId <= objectCount; objectId += 1) {
    offsets[objectId] = cursor;
    const prefix = winAnsiBytes(`${objectId} 0 obj\n`);
    const suffix = winAnsiBytes('\nendobj\n');
    parts.push(prefix, objects[objectId], suffix);
    cursor += prefix.length + objects[objectId].length + suffix.length;
  }

  const xrefOffset = cursor;
  const xref = ['xref', `0 ${objectCount + 1}`, '0000000000 65535 f '];
  for (let objectId = 1; objectId <= objectCount; objectId += 1) {
    xref.push(`${String(offsets[objectId]).padStart(10, '0')} 00000 n `);
  }
  parts.push(winAnsiBytes(
    `${xref.join('\n')}\ntrailer\n<< /Size ${objectCount + 1} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF`
  ));
  return concatBytes(parts);
}

export function downloadVectorPdf(bytes, filename) {
  const BlobCtor = globalThis.Blob;
  const URLApi = globalThis.URL;
  const documentRef = globalThis.document;
  if (typeof BlobCtor !== 'function' || !URLApi?.createObjectURL || !documentRef?.createElement) {
    throw new Error('PDF download unavailable');
  }
  const blob = new BlobCtor([bytes], { type: 'application/pdf' });
  const url = URLApi.createObjectURL(blob);
  const anchor = documentRef.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  anchor.style.display = 'none';
  documentRef.body?.append(anchor);
  anchor.click();
  anchor.remove();
  globalThis.setTimeout(() => URLApi.revokeObjectURL(url), 1500);
}
