const MAP_SETTLE_MS = 120;
const LAYER_CAPTURE_TIMEOUT_MS = 900;
const TOTAL_CAPTURE_TIMEOUT_MS = 7000;
const MAX_VISIBLE_CANVAS_LAYERS = 10;

function wait(milliseconds) {
  return new Promise((resolve) => globalThis.setTimeout(resolve, milliseconds));
}

function withTimeout(promise, milliseconds, message) {
  return new Promise((resolve, reject) => {
    const timer = globalThis.setTimeout(() => reject(new Error(message)), milliseconds);
    Promise.resolve(promise).then(
      (value) => {
        globalThis.clearTimeout(timer);
        resolve(value);
      },
      (error) => {
        globalThis.clearTimeout(timer);
        reject(error);
      }
    );
  });
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

async function settleMap() {
  const BrowserEvent = globalThis.Event;
  if (typeof BrowserEvent === 'function') {
    globalThis.dispatchEvent?.(new BrowserEvent('resize'));
  }
  await wait(MAP_SETTLE_MS);
}

function directCanvasDataUrl(source) {
  try {
    return source.toDataURL('image/png') || '';
  } catch {
    return '';
  }
}

async function streamedCanvasDataUrl(source) {
  if (typeof source.captureStream !== 'function') return '';
  const documentRef = globalThis.document;
  const video = documentRef?.createElement?.('video');
  if (!video) return '';

  let stream;
  try {
    stream = source.captureStream(0);
    const track = stream.getVideoTracks?.()[0];
    if (!track) return '';

    video.muted = true;
    video.playsInline = true;
    video.srcObject = stream;
    const playPromise = video.play?.();
    playPromise?.catch?.(() => {});

    const startedAt = Date.now();
    while (Date.now() - startedAt < 650) {
      track.requestFrame?.();
      if (video.readyState >= 2 && video.videoWidth > 0 && video.videoHeight > 0) break;
      await wait(32);
    }
    if (video.readyState < 2 || !video.videoWidth || !video.videoHeight) return '';

    const canvas = documentRef.createElement('canvas');
    canvas.width = Math.max(1, source.width || video.videoWidth);
    canvas.height = Math.max(1, source.height || video.videoHeight);
    const context = canvas.getContext('2d');
    if (!context) return '';
    context.drawImage(video, 0, 0, canvas.width, canvas.height);
    return canvas.toDataURL('image/png');
  } catch {
    return '';
  } finally {
    video.pause?.();
    video.srcObject = null;
    stream?.getTracks?.().forEach((track) => track.stop());
  }
}

async function captureCanvasLayer(source) {
  const streamed = await withTimeout(
    streamedCanvasDataUrl(source),
    LAYER_CAPTURE_TIMEOUT_MS,
    'Map canvas stream timed out'
  ).catch(() => '');
  if (streamed) return streamed;
  return directCanvasDataUrl(source);
}

function drawDot(context, dot, rootRect, scale) {
  const rect = dot.getBoundingClientRect();
  if (!rect.width || !rect.height) return;
  const styles = globalThis.getComputedStyle?.(dot);
  const color = dot.style.getPropertyValue('--itinerary-visit-color')
    || styles?.backgroundColor
    || '#111111';
  const centerX = (rect.left - rootRect.left + (rect.width / 2)) * scale;
  const centerY = (rect.top - rootRect.top + (rect.height / 2)) * scale;
  const radius = (Math.min(rect.width, rect.height) / 2) * scale;

  context.save();
  context.fillStyle = color;
  context.beginPath();
  context.arc(centerX, centerY, radius, 0, Math.PI * 2);
  context.fill();
  context.strokeStyle = '#ffffff';
  context.lineWidth = 1.3 * scale;
  context.stroke();
  context.fillStyle = '#ffffff';
  context.font = `800 ${Math.max(9, 9 * scale)}px Arial, sans-serif`;
  context.textAlign = 'center';
  context.textBaseline = 'middle';
  context.fillText(dot.textContent || '', centerX, centerY + (0.25 * scale));
  context.restore();
}

function drawMarkerFlag(context, flag, rootRect, scale) {
  const rect = flag.getBoundingClientRect();
  if (!rect.width || !rect.height) return;
  const styles = globalThis.getComputedStyle?.(flag);
  const left = (rect.left - rootRect.left) * scale;
  const top = (rect.top - rootRect.top) * scale;
  const width = rect.width * scale;
  const height = rect.height * scale;

  context.save();
  context.fillStyle = styles?.backgroundColor || '#ffffff';
  context.fillRect(left, top, width, height);
  const borderColor = styles?.borderTopColor || styles?.color;
  if (borderColor && borderColor !== 'rgba(0, 0, 0, 0)') {
    context.strokeStyle = borderColor;
    context.lineWidth = Math.max(1, scale * 0.7);
    context.strokeRect(left, top, width, height);
  }
  context.restore();
}

function drawItineraryMarkers(context, root, rootRect, scale) {
  const markers = [...root.querySelectorAll('.google-itinerary-city-marker')];
  markers.forEach((marker) => {
    [...marker.children].forEach((child) => {
      if (child.classList.contains('google-itinerary-city-marker__dot')) {
        drawDot(context, child, rootRect, scale);
      } else if (child.classList.contains('google-itinerary-city-marker__flag')) {
        drawMarkerFlag(context, child, rootRect, scale);
      }
    });
  });
}

async function captureBounded(root) {
  const documentRef = globalThis.document;
  const rootRect = root.getBoundingClientRect();
  const scale = Math.min(2.5, Math.max(1.75, Number(globalThis.devicePixelRatio) || 1));
  const canvas = documentRef.createElement('canvas');
  canvas.width = Math.max(1, Math.round(rootRect.width * scale));
  canvas.height = Math.max(1, Math.round(rootRect.height * scale));
  const context = canvas.getContext('2d');
  if (!context) throw new Error('Map capture canvas unavailable');

  const rootStyle = globalThis.getComputedStyle?.(root);
  context.fillStyle = rootStyle?.backgroundColor || '#eaf3f6';
  context.fillRect(0, 0, canvas.width, canvas.height);

  const layers = [...root.querySelectorAll('canvas')]
    .filter((layer) => {
      const rect = layer.getBoundingClientRect();
      return rect.width > 2 && rect.height > 2;
    })
    .slice(0, MAX_VISIBLE_CANVAS_LAYERS);

  let copiedLayers = 0;
  for (const layer of layers) {
    const dataUrl = await captureCanvasLayer(layer);
    if (!dataUrl) continue;
    try {
      const image = await withTimeout(loadImage(dataUrl), 600, 'Map layer image timed out');
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
      // Skip only the failed layer; the remaining rendered layers can still form the map.
    }
  }

  if (!copiedLayers) throw new Error('Google Maps render could not be captured');
  drawItineraryMarkers(context, root, rootRect, scale);

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

  await settleMap();
  return withTimeout(
    captureBounded(root),
    TOTAL_CAPTURE_TIMEOUT_MS,
    'Live itinerary map capture timed out'
  );
}
