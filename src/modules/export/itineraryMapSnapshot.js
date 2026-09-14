const MAP_REPAINT_SETTLE_MS = 90;
const STREAM_FRAME_WAIT_MS = 700;
const MAX_STREAM_FALLBACK_LAYERS = 2;
const USEFUL_PNG_DATA_URL_LENGTH = 12000;

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

function backgroundUrl(element) {
  const backgroundImage = globalThis.getComputedStyle?.(element)?.backgroundImage || '';
  const match = /url\(["']?(.+?)["']?\)/.exec(backgroundImage);
  return match?.[1] || '';
}

async function settleMapRepaint() {
  const BrowserEvent = globalThis.Event;
  if (typeof BrowserEvent === 'function' && typeof globalThis.dispatchEvent === 'function') {
    globalThis.dispatchEvent(new BrowserEvent('resize'));
  }
  await wait(MAP_REPAINT_SETTLE_MS);
}

function directCanvasDataUrl(source) {
  try {
    return source.toDataURL('image/png') || '';
  } catch {
    return '';
  }
}

async function streamCanvasDataUrl(source) {
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
    while (Date.now() - startedAt < STREAM_FRAME_WAIT_MS) {
      track.requestFrame?.();
      if (video.readyState >= 2 && video.videoWidth > 0 && video.videoHeight > 0) break;
      await wait(35);
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

async function canvasDataUrl(source, allowStreamFallback) {
  const direct = directCanvasDataUrl(source);
  if (direct.length > USEFUL_PNG_DATA_URL_LENGTH || !allowStreamFallback) return direct;
  const streamed = await streamCanvasDataUrl(source);
  return streamed.length > direct.length ? streamed : direct;
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

async function drawFlag(context, flag, rootRect, scale) {
  const src = backgroundUrl(flag);
  if (!src) return;
  const rect = flag.getBoundingClientRect();
  if (!rect.width || !rect.height) return;
  try {
    const image = await loadImage(src);
    context.drawImage(
      image,
      (rect.left - rootRect.left) * scale,
      (rect.top - rootRect.top) * scale,
      rect.width * scale,
      rect.height * scale
    );
  } catch {
    // The numbered visit marker still identifies the stop if a flag asset is unavailable.
  }
}

async function drawItineraryMarkers(context, root, rootRect, scale) {
  const markers = [...root.querySelectorAll('.google-itinerary-city-marker')];
  for (const marker of markers) {
    for (const child of [...marker.children]) {
      if (child.classList.contains('google-itinerary-city-marker__dot')) {
        drawDot(context, child, rootRect, scale);
      } else if (child.classList.contains('google-itinerary-city-marker__flag')) {
        await drawFlag(context, child, rootRect, scale);
      }
    }
  }
}

export async function captureVisibleItineraryMap() {
  const documentRef = globalThis.document;
  const root = documentRef?.querySelector?.('.mappane .google-map');
  if (!root) throw new Error('Itinerary map unavailable');
  const rootRect = root.getBoundingClientRect();
  if (rootRect.width < 2 || rootRect.height < 2) throw new Error('Itinerary map has no visible area');

  await settleMapRepaint();

  const scale = Math.min(2, Math.max(1.35, Number(globalThis.devicePixelRatio) || 1));
  const canvas = documentRef.createElement('canvas');
  canvas.width = Math.round(rootRect.width * scale);
  canvas.height = Math.round(rootRect.height * scale);
  const context = canvas.getContext('2d');
  if (!context) throw new Error('Map capture canvas unavailable');
  context.fillStyle = '#eaf3f6';
  context.fillRect(0, 0, canvas.width, canvas.height);

  const layers = [...root.querySelectorAll('canvas')]
    .filter((layer) => {
      const rect = layer.getBoundingClientRect();
      return rect.width > 2 && rect.height > 2;
    })
    .sort((left, right) => {
      const leftRect = left.getBoundingClientRect();
      const rightRect = right.getBoundingClientRect();
      return (rightRect.width * rightRect.height) - (leftRect.width * leftRect.height);
    });
  let copiedLayers = 0;

  for (const [index, layer] of layers.entries()) {
    const dataUrl = await canvasDataUrl(layer, index < MAX_STREAM_FALLBACK_LAYERS);
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
      if (dataUrl.length > USEFUL_PNG_DATA_URL_LENGTH) copiedLayers += 1;
    } catch {
      // Continue with the remaining Google Maps render layers.
    }
  }

  if (!copiedLayers) throw new Error('Google Maps render could not be captured');
  await drawItineraryMarkers(context, root, rootRect, scale);

  return {
    dataUrl: canvas.toDataURL('image/png'),
    width: canvas.width,
    height: canvas.height,
  };
}
