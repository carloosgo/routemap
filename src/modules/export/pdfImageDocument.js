const PDF_PAGE_WIDTH = 841.89;
const PDF_PAGE_HEIGHT = 595.28;

function asciiBytes(text) {
  const Encoder = globalThis.TextEncoder;
  if (typeof Encoder !== 'function') throw new Error('TextEncoder unavailable');
  return new Encoder().encode(text);
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

function jpegBytesFromDataUrl(dataUrl) {
  const match = /^data:image\/jpeg;base64,(.+)$/i.exec(String(dataUrl || ''));
  if (!match) throw new Error('Expected JPEG data URL');
  const decode = globalThis.atob;
  if (typeof decode !== 'function') throw new Error('Base64 decoder unavailable');
  const binary = decode(match[1]);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }
  return bytes;
}

export function buildImagePdf(pages, {
  pageWidth = PDF_PAGE_WIDTH,
  pageHeight = PDF_PAGE_HEIGHT,
} = {}) {
  if (!Array.isArray(pages) || pages.length === 0) {
    throw new Error('PDF requires at least one page');
  }

  const objectCount = 2 + (pages.length * 3);
  const objects = new Array(objectCount + 1);
  const pageRefs = [];

  pages.forEach((page, index) => {
    const pageObject = 3 + (index * 3);
    const contentObject = pageObject + 1;
    const imageObject = pageObject + 2;
    pageRefs.push(`${pageObject} 0 R`);

    const jpeg = jpegBytesFromDataUrl(page.dataUrl);
    const width = Math.max(1, Math.round(Number(page.width) || 1));
    const height = Math.max(1, Math.round(Number(page.height) || 1));
    const imageHeader = asciiBytes(
      `<< /Type /XObject /Subtype /Image /Width ${width} /Height ${height} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${jpeg.length} >>\nstream\n`
    );
    const imageFooter = asciiBytes('\nendstream');

    objects[pageObject] = asciiBytes(
      `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${pageWidth} ${pageHeight}] /Resources << /XObject << /Im0 ${imageObject} 0 R >> >> /Contents ${contentObject} 0 R >>`
    );

    const content = `q\n${pageWidth} 0 0 ${pageHeight} 0 0 cm\n/Im0 Do\nQ\n`;
    const contentBytes = asciiBytes(content);
    objects[contentObject] = concatBytes([
      asciiBytes(`<< /Length ${contentBytes.length} >>\nstream\n`),
      contentBytes,
      asciiBytes('endstream'),
    ]);
    objects[imageObject] = concatBytes([imageHeader, jpeg, imageFooter]);
  });

  objects[1] = asciiBytes('<< /Type /Catalog /Pages 2 0 R >>');
  objects[2] = asciiBytes(`<< /Type /Pages /Kids [${pageRefs.join(' ')}] /Count ${pages.length} >>`);

  const parts = [asciiBytes('%PDF-1.4\n%âãÏÓ\n')];
  const offsets = new Array(objectCount + 1).fill(0);
  let cursor = parts[0].length;

  for (let objectId = 1; objectId <= objectCount; objectId += 1) {
    offsets[objectId] = cursor;
    const prefix = asciiBytes(`${objectId} 0 obj\n`);
    const suffix = asciiBytes('\nendobj\n');
    parts.push(prefix, objects[objectId], suffix);
    cursor += prefix.length + objects[objectId].length + suffix.length;
  }

  const xrefOffset = cursor;
  const xrefLines = ['xref', `0 ${objectCount + 1}`, '0000000000 65535 f '];
  for (let objectId = 1; objectId <= objectCount; objectId += 1) {
    xrefLines.push(`${String(offsets[objectId]).padStart(10, '0')} 00000 n `);
  }
  const trailer = `${xrefLines.join('\n')}\ntrailer\n<< /Size ${objectCount + 1} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF`;
  parts.push(asciiBytes(trailer));
  return concatBytes(parts);
}

export function downloadPdf(bytes, filename) {
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
  globalThis.setTimeout(() => URLApi.revokeObjectURL(url), 1000);
}
