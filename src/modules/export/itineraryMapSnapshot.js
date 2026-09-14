function wait(milliseconds) {
  return new Promise((resolve) => globalThis.setTimeout(resolve, milliseconds));
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

function inlineComputedStyles(source, clone) {
  const style = globalThis.getComputedStyle?.(source);
  if (!style || !clone?.style) return;
  if (style.cssText) {
    clone.style.cssText = style.cssText;
  } else {
    for (const property of style) {
      clone.style.setProperty(
        property,
        style.getPropertyValue(property),
        style.getPropertyPriority(property)
      );
    }
  }
  clone.style.transformOrigin = style.transformOrigin || 'center center';
}

async function canvasDataUrl(source) {
  try {
    const direct = source.toDataURL('image/png');
    if (direct && direct.length > 12000) return direct;
  } catch {
    // Streaming fallback below.
  }

  if (typeof source.captureStream !== 'function') return '';
  let stream;
  try {
    stream = source.captureStream(30);
    const track = stream.getVideoTracks?.()[0];
    const documentRef = globalThis.document;
    const video = documentRef?.createElement?.('video');
    if (!track || !video) return '';
    video.muted = true;
    video.playsInline = true;
    video.srcObject = stream;
    await video.play();
    track.requestFrame?.();
    await wait(120);

    const canvas = documentRef.createElement('canvas');
    canvas.width = Math.max(1, source.width);
    canvas.height = Math.max(1, source.height);
    const context = canvas.getContext('2d');
    context.drawImage(video, 0, 0, canvas.width, canvas.height);
    return canvas.toDataURL('image/png');
  } catch {
    return '';
  } finally {
    stream?.getTracks?.().forEach((track) => track.stop());
  }
}

async function cloneNodeWithInlineAssets(node) {
  const documentRef = globalThis.document;
  if (!documentRef) throw new Error('Document unavailable');

  const NodeCtor = globalThis.Node;
  if (node.nodeType === NodeCtor?.TEXT_NODE) {
    return documentRef.createTextNode(node.textContent || '');
  }
  if (node.nodeType !== NodeCtor?.ELEMENT_NODE) {
    return documentRef.createTextNode('');
  }

  const tagName = node.tagName?.toLowerCase?.();
  let clone;

  if (tagName === 'canvas') {
    clone = documentRef.createElement('img');
    inlineComputedStyles(node, clone);
    clone.setAttribute('width', String(node.width || Math.round(node.getBoundingClientRect().width) || 1));
    clone.setAttribute('height', String(node.height || Math.round(node.getBoundingClientRect().height) || 1));
    const dataUrl = await canvasDataUrl(node);
    if (dataUrl) clone.setAttribute('src', dataUrl);
    return clone;
  }

  clone = node.cloneNode(false);
  inlineComputedStyles(node, clone);

  const rect = node.getBoundingClientRect?.();
  if (rect?.width) clone.style.width = `${rect.width}px`;
  if (rect?.height) clone.style.height = `${rect.height}px`;

  if (tagName === 'img') {
    const src = node.currentSrc || node.src;
    if (src) clone.setAttribute('src', src);
  }

  for (const child of [...node.childNodes]) {
    clone.appendChild(await cloneNodeWithInlineAssets(child));
  }
  return clone;
}

async function captureElementScreenshot(element, scale) {
  const documentRef = globalThis.document;
  const Serializer = globalThis.XMLSerializer;
  if (typeof Serializer !== 'function') throw new Error('XMLSerializer unavailable');
  const serializer = new Serializer();
  const rect = element.getBoundingClientRect();
  const width = Math.max(1, Math.round(rect.width));
  const height = Math.max(1, Math.round(rect.height));
  const clone = await cloneNodeWithInlineAssets(element);
  const wrapper = documentRef.createElement('div');
  wrapper.setAttribute('xmlns', 'http://www.w3.org/1999/xhtml');
  wrapper.style.width = `${width}px`;
  wrapper.style.height = `${height}px`;
  wrapper.style.overflow = 'hidden';
  wrapper.style.background = globalThis.getComputedStyle?.(element)?.backgroundColor || '#eaf3f6';
  wrapper.appendChild(clone);

  const markup = serializer.serializeToString(wrapper)
    .replace(/#/g, '%23')
    .replace(/\n/g, '%0A');
  const svg = `
    <svg xmlns="http://www.w3.org/2000/svg" width="${width * scale}" height="${height * scale}" viewBox="0 0 ${width} ${height}">
      <foreignObject x="0" y="0" width="${width}" height="${height}">${markup}</foreignObject>
    </svg>`;
  const dataUrl = `data:image/svg+xml;charset=utf-8,${svg}`;
  const image = await loadImage(dataUrl);
  const canvas = documentRef.createElement('canvas');
  canvas.width = width * scale;
  canvas.height = height * scale;
  const context = canvas.getContext('2d');
  context.drawImage(image, 0, 0, canvas.width, canvas.height);
  return {
    dataUrl: canvas.toDataURL('image/png'),
    width: canvas.width,
    height: canvas.height,
  };
}

async function compositeCanvasFallback(root, scale) {
  const documentRef = globalThis.document;
  const rootRect = root.getBoundingClientRect();
  const canvas = documentRef.createElement('canvas');
  canvas.width = Math.round(rootRect.width * scale);
  canvas.height = Math.round(rootRect.height * scale);
  const context = canvas.getContext('2d');
  context.fillStyle = '#eaf3f6';
  context.fillRect(0, 0, canvas.width, canvas.height);

  const layers = [...root.querySelectorAll('canvas')].filter((layer) => {
    const rect = layer.getBoundingClientRect();
    return rect.width > 2 && rect.height > 2;
  });

  let copiedLayers = 0;
  for (const layer of layers) {
    const dataUrl = await canvasDataUrl(layer);
    if (!dataUrl) continue;
    try {
      const image = await loadImage(dataUrl);
      const rect = layer.getBoundingClientRect();
      context.drawImage(
        image,
        (rect.left - rootRect.left) * scale,
        (rect.top - rootRect.top) * scale,
        rect.width * scale,
        rect.height * scale
      );
      copiedLayers += 1;
    } catch {
      // Continue with any remaining layers.
    }
  }

  if (!copiedLayers) throw new Error('Google Maps render could not be captured');
  return {
    dataUrl: canvas.toDataURL('image/png'),
    width: canvas.width,
    height: canvas.height,
  };
}

export async function captureVisibleItineraryMap() {
  const documentRef = globalThis.document;
  const root = documentRef?.querySelector?.('.mappane .google-map');
  if (!root) throw new Error('Itinerary map unavailable');
  const rootRect = root.getBoundingClientRect();
  if (rootRect.width < 2 || rootRect.height < 2) throw new Error('Itinerary map has no visible area');

  const scale = Math.max(2, Math.min(3, Math.ceil(Number(globalThis.devicePixelRatio) || 1)));
  try {
    return await captureElementScreenshot(root, scale);
  } catch (error) {
    console.warn('[Itinerary PDF] SVG snapshot fallback to layer composite', error);
    return compositeCanvasFallback(root, scale);
  }
}
