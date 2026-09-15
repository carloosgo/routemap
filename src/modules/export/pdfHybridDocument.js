import { PDF_A4_LANDSCAPE } from './pdfVectorDocument.js';

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
  const bytes = [];
  for (const char of String(text ?? '')) {
    const codePoint = char.codePointAt(0);
    if (codePoint <= 0x7f || (codePoint >= 0xa0 && codePoint <= 0xff)) bytes.push(codePoint);
    else if (CP1252.has(codePoint)) bytes.push(CP1252.get(codePoint));
    else bytes.push(0x3f);
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

function imageName(value, index) {
  const safe = String(value || '').replace(/[^A-Za-z0-9]/g, '');
  return safe || `Im${index + 1}`;
}

function imageDrawBox(image, box, fit) {
  if (fit !== 'contain') return box;
  const imageAspect = image.pixelWidth / image.pixelHeight;
  const boxAspect = box.width / box.height;
  if (!Number.isFinite(imageAspect) || imageAspect <= 0 || !Number.isFinite(boxAspect) || boxAspect <= 0) {
    return box;
  }
  if (imageAspect > boxAspect) {
    const height = box.width / imageAspect;
    return {
      x: box.x,
      y: box.y + ((box.height - height) / 2),
      width: box.width,
      height,
    };
  }
  const width = box.height * imageAspect;
  return {
    x: box.x + ((box.width - width) / 2),
    y: box.y,
    width,
    height: box.height,
  };
}

export function addJpegImage(page, image, box, name = 'MapImage', { fit = 'stretch' } = {}) {
  if (!page || !image?.bytes?.length) throw new Error('JPEG image bytes are required');
  const pixelWidth = Math.max(1, Math.trunc(Number(image.pixelWidth) || 0));
  const pixelHeight = Math.max(1, Math.trunc(Number(image.pixelHeight) || 0));
  if (!pixelWidth || !pixelHeight) throw new Error('JPEG image dimensions are required');
  const resourceName = imageName(name, page.images?.length || 0);
  if (!Array.isArray(page.images)) page.images = [];
  page.images.push({
    name: resourceName,
    bytes: image.bytes,
    pixelWidth,
    pixelHeight,
  });
  const drawBox = imageDrawBox({ pixelWidth, pixelHeight }, box, fit);
  const bottom = page.height - drawBox.y - drawBox.height;
  page.commands.push(
    `q ${number(drawBox.width)} 0 0 ${number(drawBox.height)} ${number(drawBox.x)} ${number(bottom)} cm /${resourceName} Do Q`
  );
  return resourceName;
}

function imageObject(image) {
  return concatBytes([
    winAnsiBytes(
      `<< /Type /XObject /Subtype /Image /Width ${image.pixelWidth} /Height ${image.pixelHeight} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${image.bytes.length} >>\nstream\n`
    ),
    image.bytes,
    winAnsiBytes('\nendstream'),
  ]);
}

export function buildHybridPdf(pages, {
  width = PDF_A4_LANDSCAPE.width,
  height = PDF_A4_LANDSCAPE.height,
} = {}) {
  if (!Array.isArray(pages) || !pages.length) throw new Error('PDF requires at least one page');

  const objects = [null];
  objects[1] = winAnsiBytes('<< /Type /Catalog /Pages 2 0 R >>');
  objects[2] = null;
  objects[3] = winAnsiBytes('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>');
  objects[4] = winAnsiBytes('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>');
  const pageRefs = [];

  pages.forEach((page) => {
    const imageRefs = [];
    (Array.isArray(page?.images) ? page.images : []).forEach((image) => {
      const objectId = objects.length;
      objects.push(imageObject(image));
      imageRefs.push(`/${image.name} ${objectId} 0 R`);
    });

    const pageObject = objects.length;
    objects.push(null);
    const contentObject = objects.length;
    const content = page?.toBytes ? page.toBytes() : winAnsiBytes(String(page?.content || ''));
    objects.push(concatBytes([
      winAnsiBytes(`<< /Length ${content.length} >>\nstream\n`),
      content,
      winAnsiBytes('\nendstream'),
    ]));
    pageRefs.push(`${pageObject} 0 R`);
    const pageWidth = page?.width || width;
    const pageHeight = page?.height || height;
    const xObjects = imageRefs.length ? ` /XObject << ${imageRefs.join(' ')} >>` : '';
    objects[pageObject] = winAnsiBytes(
      `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${number(pageWidth)} ${number(pageHeight)}] /Resources << /Font << /F1 3 0 R /F2 4 0 R >>${xObjects} >> /Contents ${contentObject} 0 R >>`
    );
  });

  objects[2] = winAnsiBytes(`<< /Type /Pages /Kids [${pageRefs.join(' ')}] /Count ${pages.length} >>`);
  const objectCount = objects.length - 1;
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